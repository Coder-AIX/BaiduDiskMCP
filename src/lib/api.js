export class ApiError extends Error {
    constructor(code, message, status = 0, details) {
        super(message);
        this.name = "ApiError";
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

function isPlainObject(value) {
    if (value === null || typeof value !== "object") {
        return false;
    }

    const proto = Object.getPrototypeOf(value);

    return proto === Object.prototype || proto === null;
}

function messageForStatus(status) {
    const messages = {
        400: "请求参数有误",
        401: "未授权",
        403: "没有权限",
        404: "请求的资源不存在",
        409: "资源冲突",
        413: "内容过大",
        500: "服务内部错误",
        502: "上游服务异常",
        503: "服务暂不可用"
    };

    return messages[status] || `请求失败（HTTP ${status}）`;
}

async function request(url, options = {}) {
    const init = { ...options };
    const headers = new Headers(init.headers);

    if (isPlainObject(init.body)) {
        init.body = JSON.stringify(init.body);

        if (!headers.has("content-type")) {
            headers.set("content-type", "application/json");
        }
    }

    init.headers = headers;

    let response;

    try {
        response = await fetch(url, init);
    } catch (error) {
        throw new ApiError("NETWORK_ERROR", "网络请求失败", 0, { cause: error });
    }

    let data;

    try {
        data = await response.json();
    } catch (error) {
        throw new ApiError("INVALID_RESPONSE", "服务返回了无法解析的响应", response.status, {
            cause: error
        });
    }

    if (
        response.status === 401 &&
        typeof window !== "undefined" &&
        url.startsWith("/api/admin/") &&
        !url.startsWith("/api/admin/auth/") &&
        !window.location.pathname.startsWith("/admin/login") &&
        !window.location.pathname.startsWith("/admin/setup")
    ) {
        const next = window.location.pathname + window.location.search;
        window.location.assign(`/admin/login?next=${encodeURIComponent(next)}`);
    }

    if (!response.ok || !data || data.ok === false) {
        const backendError = data && data.error ? data.error : null;
        const code = backendError && backendError.code ? backendError.code : "HTTP_ERROR";
        const message =
            backendError && backendError.message
                ? backendError.message
                : messageForStatus(response.status);
        const details = backendError ? backendError.details : undefined;

        throw new ApiError(code, message, response.status, details);
    }

    return data.data;
}

export function apiGet(url) {
    return request(url, { method: "GET" });
}

export function apiPost(url, body) {
    return request(url, { method: "POST", body });
}

export function apiPut(url, body) {
    return request(url, { method: "PUT", body });
}

export function apiPatch(url, body) {
    return request(url, { method: "PATCH", body });
}

export function apiDelete(url, body) {
    return request(url, { method: "DELETE", body });
}
