import { randomBytes } from "node:crypto";
import { db } from "./db.js";
import { normalizePath } from "./permissions.js";
import { AppError, ERROR_CODES } from "./result.js";

const MIN_TTL_SEC = 60;
const MAX_TTL_SEC = 3600;

const insertDownloadLink = db.prepare(
    `INSERT INTO download_links (token, user_id, path, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id, token, path, expires_at AS expiresAt`
);

const selectDownloadLink = db.prepare(
    `SELECT id, token, user_id AS userId, path, expires_at AS expiresAt, created_at AS createdAt
     FROM download_links
     WHERE token = ?`
);

const deleteExpiredDownloadLinks = db.prepare(
    "DELETE FROM download_links WHERE expires_at <= ?"
);

function assertTtl(ttlSec) {
    if (
        !Number.isInteger(ttlSec) ||
        ttlSec < MIN_TTL_SEC ||
        ttlSec > MAX_TTL_SEC
    ) {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            `ttlSec 必须是 ${MIN_TTL_SEC}-${MAX_TTL_SEC} 之间的整数`,
            400,
            { ttlSec }
        );
    }
}

export function createDownloadLink({ userId, path, ttlSec = 600 }) {
    const normalizedPath = normalizePath(path);
    assertTtl(ttlSec);

    const token = randomBytes(32).toString("base64url");
    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const expiresAt = new Date(now + ttlSec * 1000).toISOString();

    const link = insertDownloadLink.get(
        token,
        userId,
        normalizedPath,
        expiresAt,
        createdAt
    );

    return {
        id: link.id,
        token: link.token,
        path: link.path,
        expiresAt: link.expiresAt
    };
}

export function getDownloadLink(token) {
    const link = selectDownloadLink.get(token);

    return link ?? null;
}

export function isDownloadLinkActive(link) {
    if (!link || typeof link.expiresAt !== "string") {
        return false;
    }

    const expiresAt = Date.parse(link.expiresAt);

    return !Number.isNaN(expiresAt) && expiresAt > Date.now();
}

export function cleanupExpiredDownloadLinks() {
    const result = deleteExpiredDownloadLinks.run(new Date().toISOString());

    return result.changes;
}
