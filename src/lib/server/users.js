import { randomBytes } from "node:crypto";
import { db } from "./db.js";
import { AppError, ERROR_CODES } from "./result.js";

const listStmt = db.prepare(
    "SELECT * FROM users ORDER BY created_at DESC, id DESC"
);
const getStmt = db.prepare("SELECT * FROM users WHERE id = ?");
const getByKeyStmt = db.prepare("SELECT * FROM users WHERE api_key = ?");
const insertStmt = db.prepare(
    "INSERT INTO users (name, api_key, enabled, created_at) VALUES (?, ?, 1, ?)"
);
const updateNameStmt = db.prepare("UPDATE users SET name = ? WHERE id = ?");
const updateEnabledStmt = db.prepare(
    "UPDATE users SET enabled = ? WHERE id = ?"
);
const updateNameAndEnabledStmt = db.prepare(
    "UPDATE users SET name = ?, enabled = ? WHERE id = ?"
);
const updateKeyStmt = db.prepare("UPDATE users SET api_key = ? WHERE id = ?");
const deleteStmt = db.prepare("DELETE FROM users WHERE id = ?");

function toUser(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        name: row.name,
        apiKey: row.api_key,
        enabled: Boolean(row.enabled),
        createdAt: row.created_at
    };
}

function generateKey() {
    return `mcp_${randomBytes(24).toString("base64url")}`;
}

function validateName(name) {
    const value = typeof name === "string" ? name.trim() : "";

    if (!value) {
        throw new AppError(ERROR_CODES.INVALID_ARGUMENT, "用户名称不能为空");
    }

    if (value.length > 50) {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "用户名称长度不能超过 50"
        );
    }

    return value;
}

function notFound(id) {
    return new AppError(ERROR_CODES.NOT_FOUND, `用户 ${id} 不存在`, 404);
}

function isUniqueViolation(error) {
    return (
        typeof error?.code === "string" &&
        error.code.startsWith("SQLITE_CONSTRAINT")
    );
}

export function listUsers() {
    return listStmt.all().map(toUser);
}

export function getUser(id) {
    if (id === undefined || id === null) {
        return null;
    }

    return toUser(getStmt.get(id));
}

export function getUserByKey(key) {
    if (key === undefined || key === null || key === "") {
        return null;
    }

    return toUser(getByKeyStmt.get(key));
}

export function createUser(name) {
    const value = validateName(name);
    const createdAt = new Date().toISOString();
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        const apiKey = generateKey();

        try {
            const info = insertStmt.run(value, apiKey, createdAt);
            return getUser(info.lastInsertRowid);
        } catch (error) {
            if (!isUniqueViolation(error) || attempt === maxRetries) {
                if (isUniqueViolation(error)) {
                    throw new AppError(
                        ERROR_CODES.CONFLICT,
                        "用户 Key 生成冲突，请重试",
                        409
                    );
                }

                throw error;
            }
        }
    }

    throw new AppError(
        ERROR_CODES.CONFLICT,
        "用户 Key 生成冲突，请重试",
        409
    );
}

export function updateUser(id, { name, enabled } = {}) {
    const hasName = name !== undefined;
    const hasEnabled = enabled !== undefined;

    if (!hasName && !hasEnabled) {
        const current = getUser(id);

        if (!current) {
            throw notFound(id);
        }

        return current;
    }

    const value = hasName ? validateName(name) : undefined;
    const enabledValue = hasEnabled ? (enabled ? 1 : 0) : undefined;
    let info;

    if (hasName && hasEnabled) {
        info = updateNameAndEnabledStmt.run(value, enabledValue, id);
    } else if (hasName) {
        info = updateNameStmt.run(value, id);
    } else {
        info = updateEnabledStmt.run(enabledValue, id);
    }

    if (info.changes === 0) {
        throw notFound(id);
    }

    return getUser(id);
}

export function deleteUser(id) {
    const info = deleteStmt.run(id);

    if (info.changes === 0) {
        throw notFound(id);
    }

    return true;
}

export function regenerateKey(id) {
    const user = getUser(id);

    if (!user) {
        throw notFound(id);
    }

    const apiKey = generateKey();
    updateKeyStmt.run(apiKey, user.id);

    return { id: user.id, apiKey };
}

export function verifyKey(key) {
    if (typeof key !== "string" || !key) {
        return null;
    }

    const user = getUserByKey(key);

    if (!user || !user.enabled) {
        return null;
    }

    return user;
}
