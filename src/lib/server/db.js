import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "$env/dynamic/private";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS grants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('view', 'edit', 'manage')),
    created_at TEXT NOT NULL,
    UNIQUE (user_id, path)
);

CREATE TABLE IF NOT EXISTS upload_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_dir TEXT NOT NULL,
    file_name TEXT,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS download_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_auth (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
`;

const DEFAULT_SETTINGS = {
    baidu_access_token: env.BAIDU_ACCESS_TOKEN ?? "",
    baidu_app_name: env.BAIDU_APP_NAME ?? "",
    app_base_url: env.APP_BASE_URL ?? "http://localhost:3000",
    baidu_authorize_url: env.BAIDU_AUTHORIZE_URL ?? "",
    upload_link_ttl_sec: "900",
    max_upload_size: "2147483648"
};

function createDatabase() {
    const dbPath = path.resolve(process.cwd(), env.DB_PATH ?? "./data/app.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const database = new Database(dbPath);

    database.pragma("foreign_keys = ON");
    // WHY: WAL 允许读写并发，避免管理端与 MCP 同时访问时互相阻塞
    database.pragma("journal_mode = WAL");

    database.exec(SCHEMA);

    const insertSetting = database.prepare(
        "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
    );
    const seedSettings = database.transaction(() => {
        for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
            insertSetting.run(key, String(value));
        }
    });
    seedSettings();

    return database;
}

// WHY: Vite 热更新会重复执行模块，挂到 globalThis 上避免重复打开数据库
const globalForDb = globalThis;

export const db = globalForDb.__appDb ?? createDatabase();

if (!globalForDb.__appDb) {
    globalForDb.__appDb = db;
}
