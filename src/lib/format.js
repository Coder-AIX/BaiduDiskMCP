const AVATAR_TONES = [
    { bg: "#e4eff1", ink: "#125463" },
    { bg: "#eceef3", ink: "#3a4454" },
    { bg: "#f1eee7", ink: "#5c4a2e" },
    { bg: "#ecefe6", ink: "#40512e" }
];

export function formatSize(bytes) {
    const size = Number(bytes);

    if (!Number.isFinite(size) || size < 0) {
        return "—";
    }

    if (size < 1024) {
        return `${size} B`;
    }

    const units = ["KB", "MB", "GB", "TB"];
    let value = size / 1024;
    let index = 0;

    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }

    return `${value.toFixed(1)} ${units[index]}`;
}

export function formatDateTime(value) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString("zh-CN", { hour12: false });
}

export function formatFileTime(mtime) {
    if (mtime === null || mtime === undefined || mtime === "") {
        return "—";
    }

    const seconds = Number(mtime);

    if (!Number.isFinite(seconds)) {
        return "—";
    }

    const date = new Date(seconds * 1000);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    const pad = (value) => String(value).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function initialOf(name) {
    const text = String(name ?? "").trim();

    return text ? text.slice(0, 1).toUpperCase() : "?";
}

export function avatarTone(name) {
    const text = String(name ?? "");
    let total = 0;

    for (let index = 0; index < text.length; index += 1) {
        total += text.charCodeAt(index);
    }

    return AVATAR_TONES[total % AVATAR_TONES.length];
}
