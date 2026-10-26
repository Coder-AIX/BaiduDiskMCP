import {
    createHash,
    randomBytes,
    scrypt as scryptCallback,
    timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";
import { db } from "./db.js";
import { AppError, ERROR_CODES } from "./result.js";

const scrypt = promisify(scryptCallback);

export const ADMIN_SESSION_COOKIE = "baidudiskmcp_admin_session";
export const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

const selectAuth = db.prepare("SELECT password_hash FROM admin_auth WHERE id = 1");
const insertAuth = db.prepare(
    "INSERT INTO admin_auth (id, password_hash, created_at) VALUES (1, ?, ?)"
);
const selectSession = db.prepare(
    "SELECT token_hash, expires_at FROM admin_sessions WHERE token_hash = ?"
);
const insertSession = db.prepare(
    "INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)"
);
const deleteSession = db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?");
const deleteExpiredSessions = db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?");
const deleteAllSessions = db.prepare("DELETE FROM admin_sessions");

const saveAdminPassword = db.transaction((passwordHash) => {
    insertAuth.run(passwordHash, new Date().toISOString());
    deleteAllSessions.run();
});

const loginAttempts = new Map();

function hashSessionToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password) {
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, SCRYPT_KEYLEN, {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: SCRYPT_MAXMEM
    });

    return [
        "scrypt",
        SCRYPT_N,
        SCRYPT_R,
        SCRYPT_P,
        salt.toString("base64url"),
        derived.toString("base64url")
    ].join("$");
}

async function verifyPasswordHash(password, stored) {
    const parts = String(stored ?? "").split("$");

    if (parts.length !== 6 || parts[0] !== "scrypt") {
        return false;
    }

    const [, n, r, p, salt, expected] = parts;
    const saltBuffer = Buffer.from(salt, "base64url");
    const expectedBuffer = Buffer.from(expected, "base64url");

    if (saltBuffer.length === 0 || expectedBuffer.length === 0) {
        return false;
    }

    const derived = await scrypt(password, saltBuffer, expectedBuffer.length, {
        N: Number(n),
        r: Number(r),
        p: Number(p),
        maxmem: SCRYPT_MAXMEM
    });

    return derived.length === expectedBuffer.length && timingSafeEqual(derived, expectedBuffer);
}

export function passwordValidationError(password) {
    if (typeof password !== "string") {
        return "密码必须是字符串";
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
        return `密码至少需要 ${PASSWORD_MIN_LENGTH} 个字符`;
    }

    if (password.length > PASSWORD_MAX_LENGTH) {
        return `密码不能超过 ${PASSWORD_MAX_LENGTH} 个字符`;
    }

    return null;
}

export function isAdminInitialized() {
    return Boolean(selectAuth.get());
}

export async function setupAdminPassword(password) {
    const validationError = passwordValidationError(password);

    if (validationError) {
        throw new AppError(ERROR_CODES.INVALID_ARGUMENT, validationError, 400);
    }

    if (isAdminInitialized()) {
        throw new AppError(ERROR_CODES.CONFLICT, "管理员密码已经设置", 409);
    }

    const passwordHash = await hashPassword(password);

    try {
        saveAdminPassword(passwordHash);
    } catch (error) {
        if (isAdminInitialized()) {
            throw new AppError(ERROR_CODES.CONFLICT, "管理员密码已经设置", 409);
        }

        throw error;
    }
}

export async function verifyAdminPassword(password) {
    const row = selectAuth.get();

    if (!row || typeof password !== "string") {
        return false;
    }

    return verifyPasswordHash(password, row.password_hash);
}

export function createAdminSession() {
    const now = Date.now();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashSessionToken(token);
    const expiresAt = now + ADMIN_SESSION_TTL_MS;

    deleteExpiredSessions.run(now);
    insertSession.run(tokenHash, now, expiresAt);

    return { token, expiresAt };
}

export function getAdminSession(token) {
    if (typeof token !== "string" || token === "") {
        return null;
    }

    const tokenHash = hashSessionToken(token);
    const row = selectSession.get(tokenHash);

    if (!row) {
        return null;
    }

    if (Number(row.expires_at) <= Date.now()) {
        deleteSession.run(tokenHash);
        return null;
    }

    return {
        tokenHash,
        expiresAt: Number(row.expires_at)
    };
}

export function destroyAdminSession(token) {
    if (typeof token !== "string" || token === "") {
        return;
    }

    deleteSession.run(hashSessionToken(token));
}

export function getAdminCookieOptions(url) {
    return {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: url.protocol === "https:",
        maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000)
    };
}

export function assertLoginAllowed(key) {
    const now = Date.now();
    const entry = loginAttempts.get(key);

    if (!entry || entry.resetAt <= now) {
        loginAttempts.set(key, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
        return;
    }

    if (entry.count >= LOGIN_MAX_ATTEMPTS) {
        throw new AppError(
            "RATE_LIMITED",
            "登录尝试次数过多，请稍后再试",
            429,
            { retryAt: entry.resetAt }
        );
    }
}

export function recordLoginFailure(key) {
    const now = Date.now();
    const entry = loginAttempts.get(key);

    if (!entry || entry.resetAt <= now) {
        loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
        return;
    }

    entry.count += 1;
}

export function resetLoginFailures(key) {
    loginAttempts.delete(key);
}
