// WHAT: 统一错误码，供 HTTP 接口与 MCP 工具共用，避免各写一套字符串
export const ERROR_CODES = {
    UNAUTHORIZED: "UNAUTHORIZED",
    FORBIDDEN: "FORBIDDEN",
    NOT_FOUND: "NOT_FOUND",
    INVALID_ARGUMENT: "INVALID_ARGUMENT",
    CONFLICT: "CONFLICT",
    UPLOAD_EXPIRED: "UPLOAD_EXPIRED",
    BAIDU_ERROR: "BAIDU_ERROR",
    INTERNAL_ERROR: "INTERNAL_ERROR"
};

export function ok(data) {
    return { ok: true, data };
}

export function fail(code, message, details) {
    return {
        ok: false,
        error: {
            code,
            message,
            details
        }
    };
}

export function jsonOk(data, status = 200) {
    return new Response(JSON.stringify(ok(data)), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8"
        }
    });
}

export function jsonError(code, message, status = 400, details) {
    return new Response(JSON.stringify(fail(code, message, details)), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8"
        }
    });
}

export class AppError extends Error {
    constructor(code, message, status = 400, details) {
        super(message);
        this.name = "AppError";
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

export function handleRoute(handler) {
    return async function routeHandler(event) {
        try {
            return await handler(event);
        } catch (error) {
            if (error instanceof AppError) {
                return jsonError(error.code, error.message, error.status, error.details);
            }

            console.error(error);

            return jsonError(
                ERROR_CODES.INTERNAL_ERROR,
                "服务内部错误",
                500
            );
        }
    };
}
