import { jsonOk, handleRoute, AppError, ERROR_CODES } from "$lib/server/result.js";
import { readJson } from "$lib/server/http.js";
import {
    ADMIN_SESSION_COOKIE,
    assertLoginAllowed,
    createAdminSession,
    getAdminCookieOptions,
    isAdminInitialized,
    recordLoginFailure,
    resetLoginFailures,
    verifyAdminPassword
} from "$lib/server/admin-auth.js";

export const prerender = false;

function clientKey(event) {
    try {
        return event.getClientAddress() || "unknown";
    } catch {
        return "unknown";
    }
}

export const POST = handleRoute(async (event) => {
    const { request, cookies, url } = event;
    const body = await readJson(request);
    const password = body.password;

    if (typeof password !== "string" || password === "") {
        throw new AppError(ERROR_CODES.INVALID_ARGUMENT, "请输入管理员密码", 400);
    }

    if (!isAdminInitialized()) {
        throw new AppError(ERROR_CODES.CONFLICT, "还没有设置管理员密码", 409);
    }

    const key = clientKey(event);
    assertLoginAllowed(key);

    const valid = await verifyAdminPassword(password);

    if (!valid) {
        recordLoginFailure(key);
        throw new AppError(ERROR_CODES.UNAUTHORIZED, "密码错误", 401);
    }

    resetLoginFailures(key);

    const session = createAdminSession();
    cookies.set(ADMIN_SESSION_COOKIE, session.token, getAdminCookieOptions(url));

    return jsonOk({ authenticated: true });
});
