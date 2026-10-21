import { db } from "./db.js";

// WHAT: 需要在读取时转换为数字的设置项
const NUMERIC_SETTINGS = ["upload_link_ttl_sec", "max_upload_size"];

// WHAT: 数值型设置的默认值，数据库缺失时补齐
const DEFAULTS = {
    upload_link_ttl_sec: 900,
    max_upload_size: 2147483648
};

const selectSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
const selectAllSettings = db.prepare("SELECT key, value FROM settings");
const upsertSetting = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
);

const upsertMany = db.transaction((entries) => {
    for (const [key, value] of entries) {
        if (value === null || value === undefined) {
            continue;
        }
        upsertSetting.run(key, String(value));
    }
});

export function getSetting(key) {
    const row = selectSetting.get(key);
    return row ? row.value : null;
}

export function getNumberSetting(key, fallback) {
    const raw = getSetting(key);
    if (raw === null) {
        return fallback;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
}

export function getSettings() {
    const settings = {};
    for (const row of selectAllSettings.all()) {
        settings[row.key] = row.value;
    }
    for (const key of NUMERIC_SETTINGS) {
        settings[key] = getNumberSetting(key, DEFAULTS[key]);
    }
    return settings;
}

export function setSetting(key, value) {
    upsertSetting.run(key, String(value ?? ""));
}

export function setSettings(values) {
    upsertMany(Object.entries(values ?? {}));
}
