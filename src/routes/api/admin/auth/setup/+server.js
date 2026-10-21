import { jsonOk, handleRoute, AppError, ERROR_CODES } from "$lib/server/result.js";
import { readJson } from "$lib/server/http.js";
import {
    ADMIN_SESSION_COOKIE,
    createAdminSession,
    getAdminCookieOptions,
    passwordValidationError,
    setupAdminPassword
} from "$lib/server/admin-auth.js";

export const prerender = false;

export const POST = handleRoute(async ({ request, cookies, url }) => {
    const body = await readJson(request);
    const password = body.password;
    const confirm = body.confirm;

    if (typeof password !== "string" || typeof confirm !== "string") {
        throw new AppError(ERROR_CODES.INVALID_ARGUMENT, "密码必须是字符串", 400);
    }

    if (password !== confirm) {
        throw new AppError(ERROR_CODES.INVALID_ARGUMENT, "两次输入的密码不一致", 400);
    }

    const validationError = passwordValidationError(password);

    if (validationError) {
        throw new AppError(ERROR_CODES.INVALID_ARGUMENT, validationError, 400);
    }

    await setupAdminPassword(password);

    const session = createAdminSession();
    cookies.set(ADMIN_SESSION_COOKIE, session.token, getAdminCookieOptions(url));

    return jsonOk({ initialized: true }, 201);
});
