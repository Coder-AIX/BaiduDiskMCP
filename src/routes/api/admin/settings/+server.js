import { handleRoute, jsonOk, AppError, ERROR_CODES } from "$lib/server/result.js";
import { readJson, requireInt } from "$lib/server/http.js";
import { getSettings, setSettings } from "$lib/server/settings.js";

export const prerender = false;

function invalid(message) {
    return new AppError(ERROR_CODES.INVALID_ARGUMENT, message, 400);
}

function has(body, key) {
    return Object.prototype.hasOwnProperty.call(body, key);
}

function readString(body, key) {
    const value = body[key];

    if (typeof value !== "string") {
        throw invalid(`${key} 必须是字符串`);
    }

    return value;
}

function readHttpUrl(body, key) {
    const value = readString(body, key).trim();

    if (!value) {
        return "";
    }

    let url;

    try {
        url = new URL(value);
    } catch {
        throw invalid(`${key} 必须是 http/https URL`);
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw invalid(`${key} 必须是 http/https URL`);
    }

    return value;
}

function readAppBaseUrl(body) {
    const value = body.app_base_url;

    if (typeof value !== "string" || value.trim() === "") {
        throw invalid("app_base_url 不能为空");
    }

    const result = value.trim();

    if (result.startsWith("/")) {
        return result;
    }

    let url;

    try {
        url = new URL(result);
    } catch {
        throw invalid("app_base_url 必须是 http/https URL 或以 / 开头");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw invalid("app_base_url 必须是 http/https URL 或以 / 开头");
    }

    return result;
}

export const GET = handleRoute(async () => {
    return jsonOk(getSettings());
});

export const PUT = handleRoute(async ({ request }) => {
    const body = await readJson(request);
    const updates = {};

    if (has(body, "baidu_access_token")) {
        updates.baidu_access_token = readString(body, "baidu_access_token");
    }

    if (has(body, "baidu_app_name")) {
        updates.baidu_app_name = readString(body, "baidu_app_name");
    }

    if (has(body, "baidu_authorize_url")) {
        updates.baidu_authorize_url = readHttpUrl(body, "baidu_authorize_url");
    }

    if (has(body, "app_base_url")) {
        updates.app_base_url = readAppBaseUrl(body);
    }

    if (has(body, "upload_link_ttl_sec")) {
        updates.upload_link_ttl_sec = requireInt(
            body.upload_link_ttl_sec,
            "upload_link_ttl_sec",
            { min: 60, max: 86400 }
        );
    }

    if (has(body, "max_upload_size")) {
        updates.max_upload_size = requireInt(
            body.max_upload_size,
            "max_upload_size",
            { min: 1 }
        );
    }

    setSettings(updates);

    return jsonOk(getSettings());
});
