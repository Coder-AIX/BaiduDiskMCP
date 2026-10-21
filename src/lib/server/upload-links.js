import { randomBytes } from "node:crypto";
import { db } from "./db.js";
import { normalizePath, validateName } from "./permissions.js";
import { getNumberSetting } from "./settings.js";
import { AppError, ERROR_CODES } from "./result.js";

const MIN_TTL_SEC = 60;
const MAX_TTL_SEC = 86400;

const insertUploadLink = db.prepare(
    `INSERT INTO upload_links (token, user_id, target_dir, file_name, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
);
const selectUploadLinkByToken = db.prepare(
    `SELECT id, token, user_id AS userId, target_dir AS targetDir, file_name AS fileName,
            expires_at AS expiresAt, used_at AS usedAt, created_at AS createdAt
     FROM upload_links
     WHERE token = ?`
);
const selectUploadLinks = db.prepare(
    `SELECT id, token, user_id AS userId, target_dir AS targetDir, file_name AS fileName,
            expires_at AS expiresAt, used_at AS usedAt, created_at AS createdAt
     FROM upload_links
     ORDER BY created_at DESC`
);
const selectUploadLinksByUser = db.prepare(
    `SELECT id, token, user_id AS userId, target_dir AS targetDir, file_name AS fileName,
            expires_at AS expiresAt, used_at AS usedAt, created_at AS createdAt
     FROM upload_links
     WHERE user_id = ?
     ORDER BY created_at DESC`
);
const deleteUploadLink = db.prepare("DELETE FROM upload_links WHERE id = ?");
const claimUploadLinkRow = db.prepare(
    "UPDATE upload_links SET used_at = ? WHERE id = ? AND used_at IS NULL"
);
const releaseUploadLinkRow = db.prepare(
    "UPDATE upload_links SET used_at = NULL WHERE id = ?"
);

function resolveStatus(link, now) {
    if (link.usedAt) {
        return "used";
    }

    const expiresAt = Date.parse(link.expiresAt);

    if (Number.isFinite(expiresAt) && expiresAt <= now) {
        return "expired";
    }

    return "active";
}

function toLinkView(row, now) {
    return {
        id: row.id,
        token: row.token,
        userId: row.userId,
        targetDir: row.targetDir,
        fileName: row.fileName,
        expiresAt: row.expiresAt,
        usedAt: row.usedAt,
        createdAt: row.createdAt,
        status: resolveStatus(row, now)
    };
}

export function createUploadLink({ userId, dir, fileName, ttlSec } = {}) {
    const targetDir = normalizePath(dir);

    let resolvedFileName = null;

    if (fileName !== null && fileName !== undefined && fileName !== "") {
        resolvedFileName = validateName(fileName);
    }

    let ttl = ttlSec;

    if (ttl === null || ttl === undefined) {
        ttl = getNumberSetting("upload_link_ttl_sec", 900);
    } else if (
        !Number.isInteger(ttl) ||
        ttl < MIN_TTL_SEC ||
        ttl > MAX_TTL_SEC
    ) {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            `ttlSec 必须是 ${MIN_TTL_SEC}–${MAX_TTL_SEC} 的整数`,
            400,
            { ttlSec }
        );
    }

    const token = randomBytes(32).toString("base64url");
    const now = Date.now();
    const expiresAt = new Date(now + ttl * 1000).toISOString();
    const createdAt = new Date(now).toISOString();

    const info = insertUploadLink.run(
        token,
        userId,
        targetDir,
        resolvedFileName,
        expiresAt,
        createdAt
    );

    return {
        id: info.lastInsertRowid,
        token,
        targetDir,
        fileName: resolvedFileName,
        expiresAt
    };
}

export function getUploadLink(token) {
    const row = selectUploadLinkByToken.get(token);

    if (!row) {
        return null;
    }

    return toLinkView(row, Date.now());
}

export function listUploadLinks(userId) {
    const rows =
        userId === null || userId === undefined
            ? selectUploadLinks.all()
            : selectUploadLinksByUser.all(userId);

    const now = Date.now();

    return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        tokenPrefix: row.token.slice(0, 8),
        targetDir: row.targetDir,
        fileName: row.fileName,
        expiresAt: row.expiresAt,
        usedAt: row.usedAt,
        createdAt: row.createdAt,
        status: resolveStatus(row, now)
    }));
}

export function revokeUploadLink(id) {
    const info = deleteUploadLink.run(id);

    if (info.changes === 0) {
        throw new AppError(
            ERROR_CODES.NOT_FOUND,
            "上传短链不存在",
            404,
            { id }
        );
    }

    return true;
}

export function claimUploadLink(id) {
    const info = claimUploadLinkRow.run(new Date().toISOString(), id);

    if (info.changes === 0) {
        throw new AppError(
            ERROR_CODES.CONFLICT,
            "上传短链已被使用",
            409
        );
    }

    return true;
}

export function releaseUploadLink(id) {
    const info = releaseUploadLinkRow.run(id);

    return info.changes > 0;
}
