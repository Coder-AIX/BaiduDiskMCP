import { verifyKey } from "./users.js";
import { AppError, ERROR_CODES } from "./result.js";

const UNAUTHORIZED_MESSAGE = "缺少或无效的 API Key";

function normalizeKey(value) {
    if (typeof value !== "string") {
        return null;
    }

    const key = value.trim();

    return key || null;
}

export function extractApiKey(request) {
    const headers = request && request.headers;

    if (headers && typeof headers.get === "function") {
        const authorization = headers.get("authorization");

        if (typeof authorization === "string" && authorization.trim()) {
            const value = authorization.trim();
            const bearerMatch = /^bearer\s+(.*)$/i.exec(value);
            const key = normalizeKey(bearerMatch ? bearerMatch[1] : value);

            if (key) {
                return key;
            }
        }

        const apiKey = normalizeKey(headers.get("x-api-key"));

        if (apiKey) {
            return apiKey;
        }
    }

    const url = request && request.url;

    if (typeof url === "string" && url) {
        try {
            const key = normalizeKey(new URL(url).searchParams.get("key"));

            if (key) {
                return key;
            }
        } catch {
            return null;
        }
    }

    return null;
}

export function authenticate(request) {
    const key = extractApiKey(request);
    const user = key ? verifyKey(key) : null;

    if (!user) {
        throw new AppError(
            ERROR_CODES.UNAUTHORIZED,
            UNAUTHORIZED_MESSAGE,
            401
        );
    }

    return user;
}
