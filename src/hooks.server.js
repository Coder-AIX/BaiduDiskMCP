import fs from "node:fs/promises";
import path from "node:path";
import { redirect } from "@sveltejs/kit";
import { jsonError, ERROR_CODES } from "$lib/server/result.js";
import {
    ADMIN_SESSION_COOKIE,
    getAdminSession,
    isAdminInitialized
} from "$lib/server/admin-auth.js";

export async function init() {
    if (globalThis.__studioDriveInitDone) {
        return;
    }
    globalThis.__studioDriveInitDone = true;

    // WHY: 只存放未完成的临时上传数据，进程重启后无法继续使用
    const tempDir = path.resolve(process.cwd(), "data/tmp");

    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.mkdir(tempDir, { recursive: true });
}

function isAdminPage(pathname) {
    return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isAdminApi(pathname) {
    return pathname.startsWith("/api/admin/");
}

function clearSessionCookie(cookies, token) {
    if (token) {
        cookies.delete(ADMIN_SESSION_COOKIE, { path: "/" });
    }
}

export async function handle({ event, resolve }) {
    const { pathname } = event.url;
    const adminPage = isAdminPage(pathname);
    const adminApi = isAdminApi(pathname);

    if (!adminPage && !adminApi) {
        return resolve(event);
    }

    const initialized = isAdminInitialized();
    const token = event.cookies.get(ADMIN_SESSION_COOKIE);

    if (adminPage) {
        const session = getAdminSession(token);

        if (pathname === "/admin/setup") {
            if (initialized) {
                throw redirect(303, session ? "/admin" : "/admin/login");
            }

            return resolve(event);
        }

        if (pathname === "/admin/login") {
            if (!initialized) {
                throw redirect(303, "/admin/setup");
            }

            if (session) {
                throw redirect(303, "/admin");
            }

            return resolve(event);
        }

        if (!initialized) {
            throw redirect(303, "/admin/setup");
        }

        if (!session) {
            clearSessionCookie(event.cookies, token);

            const next = pathname + event.url.search;
            throw redirect(303, `/admin/login?next=${encodeURIComponent(next)}`);
        }

        return resolve(event);
    }

    if (pathname.startsWith("/api/admin/auth/")) {
        return resolve(event);
    }

    if (!initialized) {
        return jsonError(ERROR_CODES.UNAUTHORIZED, "请先设置管理员密码", 401);
    }

    const session = getAdminSession(token);

    if (!session) {
        clearSessionCookie(event.cookies, token);
        return jsonError(ERROR_CODES.UNAUTHORIZED, "请先登录管理端", 401);
    }

    return resolve(event);
}
