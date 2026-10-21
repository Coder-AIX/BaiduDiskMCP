import { AppError, ERROR_CODES } from "./result.js";

function invalid(message) {
    return new AppError(ERROR_CODES.INVALID_ARGUMENT, message);
}

export async function readJson(request) {
    let body;

    try {
        body = await request.json();
    } catch {
        throw invalid("请求体必须是 JSON 对象");
    }

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
        throw invalid("请求体必须是 JSON 对象");
    }

    return body;
}

export function requireString(body, key, { trim = true } = {}) {
    const value = body?.[key];

    if (typeof value !== "string") {
        throw invalid(`${key} 必须是字符串`);
    }

    const result = trim ? value.trim() : value;

    if (result.length === 0) {
        throw invalid(`${key} 不能为空`);
    }

    return result;
}

export function optionalString(body, key, { trim = true } = {}) {
    const value = body?.[key];

    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value !== "string") {
        throw invalid(`${key} 必须是字符串`);
    }

    const result = trim ? value.trim() : value;

    return result.length === 0 ? undefined : result;
}

export function requireInt(value, name, { min, max } = {}) {
    if (value === undefined || value === null || value === "") {
        throw invalid(`${name} 必须是整数`);
    }

    const result = Number(value);

    if (!Number.isInteger(result)) {
        throw invalid(`${name} 必须是整数`);
    }

    if (min !== undefined && result < min) {
        throw invalid(`${name} 不能小于 ${min}`);
    }

    if (max !== undefined && result > max) {
        throw invalid(`${name} 不能大于 ${max}`);
    }

    return result;
}

export function optionalInt(value, name, options) {
    if (value === undefined || value === null) {
        return undefined;
    }

    return requireInt(value, name, options);
}

export function parseId(value, name = "id") {
    return requireInt(value, name, { min: 1 });
}

export function requireOneOf(value, allowed, name) {
    if (!allowed.includes(value)) {
        throw invalid(`${name} 必须是 ${allowed.join("、")} 之一`);
    }

    return value;
}
