import { db } from "./db.js";
import { AppError, ERROR_CODES } from "./result.js";

// WHAT: 权限等级排序，数值越大权限越高
export const LEVEL_RANK = { view: 1, edit: 2, manage: 3 };

// WHAT: 操作到所需权限等级的映射
export const OPERATION_LEVEL = {
    list: "view",
    search: "view",
    stat: "view",
    download: "view",
    upload: "edit",
    mkdir: "edit",
    rename: "edit",
    copy: "edit",
    move: "edit",
    delete: "manage"
};

const selectGrants = db.prepare(
    "SELECT id, path, level, created_at AS createdAt FROM grants WHERE user_id = ? ORDER BY path ASC"
);
const selectGrant = db.prepare(
    "SELECT id, path, level, created_at AS createdAt FROM grants WHERE id = ?"
);
const selectGrantPaths = db.prepare(
    "SELECT path, level FROM grants WHERE user_id = ?"
);
const insertGrant = db.prepare(
    `INSERT INTO grants (user_id, path, level, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, path) DO UPDATE SET level = excluded.level, created_at = excluded.created_at
     RETURNING id, path, level, created_at AS createdAt`
);
const updateGrantRow = db.prepare(
    "UPDATE grants SET level = ? WHERE id = ? RETURNING id, path, level, created_at AS createdAt"
);
const deleteGrantRow = db.prepare(
    "DELETE FROM grants WHERE id = ? RETURNING id, path, level, created_at AS createdAt"
);

function assertLevel(level) {
    if (!Object.prototype.hasOwnProperty.call(LEVEL_RANK, level)) {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "无效的权限等级",
            400,
            { level }
        );
    }
}

export function normalizePath(path) {
    if (path === null || path === undefined) {
        return "/";
    }

    if (typeof path !== "string") {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "路径必须是字符串"
        );
    }

    const raw = path.trim();

    if (raw === "") {
        return "/";
    }

    if (raw.includes("\0")) {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "路径不能包含空字节"
        );
    }

    let normalized = raw.replace(/\\/g, "/");

    if (!normalized.startsWith("/")) {
        normalized = `/${normalized}`;
    }

    normalized = normalized.replace(/\/+/g, "/");

    const segments = normalized.split("/").filter((segment) => segment !== "");

    if (segments.includes("..")) {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "路径不能包含 .. 段",
            400,
            { path: raw }
        );
    }

    if (segments.length === 0) {
        return "/";
    }

    return `/${segments.join("/")}`;
}

export function parentPath(path) {
    const normalized = normalizePath(path);

    if (normalized === "/") {
        return "/";
    }

    const index = normalized.lastIndexOf("/");

    if (index <= 0) {
        return "/";
    }

    return normalized.slice(0, index);
}

export function joinPath(dir, name) {
    const normalizedDir = normalizePath(dir);

    if (normalizedDir === "/") {
        return normalizePath(`/${name}`);
    }

    return normalizePath(`${normalizedDir}/${name}`);
}

export function baseName(path) {
    const normalized = normalizePath(path);

    if (normalized === "/") {
        return "/";
    }

    return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export function validateName(name) {
    if (typeof name !== "string") {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "名称必须是字符串"
        );
    }

    const trimmed = name.trim();

    if (trimmed === "") {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "名称不能为空"
        );
    }

    if (trimmed.length > 255) {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "名称长度不能超过 255 个字符"
        );
    }

    if (
        trimmed.includes("/") ||
        trimmed.includes("\\") ||
        trimmed.includes("..") ||
        trimmed.includes("\0")
    ) {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "名称不能包含 /、\\、.. 或空字节",
            400,
            { name: trimmed }
        );
    }

    return trimmed;
}

export function isAncestorOrSelf(parent, target) {
    const normalizedParent = normalizePath(parent);
    const normalizedTarget = normalizePath(target);

    if (normalizedParent === "/") {
        return true;
    }

    return (
        normalizedTarget === normalizedParent ||
        normalizedTarget.startsWith(`${normalizedParent}/`)
    );
}

export function listGrants(userId) {
    return selectGrants.all(userId);
}

export function addGrant(userId, path, level) {
    const normalized = normalizePath(path);
    assertLevel(level);

    return insertGrant.get(
        userId,
        normalized,
        level,
        new Date().toISOString()
    );
}

export function getGrant(id) {
    const grant = selectGrant.get(id);

    if (!grant) {
        throw new AppError(
            ERROR_CODES.NOT_FOUND,
            "授权不存在",
            404,
            { id }
        );
    }

    return grant;
}

export function updateGrant(id, level) {
    assertLevel(level);

    const grant = updateGrantRow.get(level, id);

    if (!grant) {
        throw new AppError(
            ERROR_CODES.NOT_FOUND,
            "授权不存在",
            404,
            { id }
        );
    }

    return grant;
}

export function removeGrant(id) {
    const grant = deleteGrantRow.get(id);

    if (!grant) {
        throw new AppError(
            ERROR_CODES.NOT_FOUND,
            "授权不存在",
            404,
            { id }
        );
    }

    return grant;
}

export function effectiveLevel(userId, path) {
    const normalized = normalizePath(path);
    const grants = selectGrantPaths.all(userId);

    let best = null;

    for (const grant of grants) {
        if (!isAncestorOrSelf(grant.path, normalized)) {
            continue;
        }

        if (best === null || LEVEL_RANK[grant.level] > LEVEL_RANK[best]) {
            best = grant.level;
        }
    }

    return best;
}

export function requireLevel(userId, path, level) {
    assertLevel(level);

    const normalized = normalizePath(path);
    const actual = effectiveLevel(userId, normalized);

    if (actual === null || LEVEL_RANK[actual] < LEVEL_RANK[level]) {
        throw new AppError(
            ERROR_CODES.FORBIDDEN,
            `路径 ${normalized} 需要 ${level} 权限`,
            403,
            { path: normalized, required: level, actual }
        );
    }

    return actual;
}

export function requirePermission(userId, path, operation) {
    if (!Object.prototype.hasOwnProperty.call(OPERATION_LEVEL, operation)) {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "未知操作",
            400,
            { operation }
        );
    }

    return requireLevel(userId, path, OPERATION_LEVEL[operation]);
}

export function canView(userId, path) {
    return effectiveLevel(userId, path) !== null;
}

export function filterVisiblePaths(userId, paths) {
    if (!Array.isArray(paths)) {
        return [];
    }

    return paths.filter((path) => canView(userId, path));
}
