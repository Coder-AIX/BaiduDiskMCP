import { jsonOk, handleRoute } from "$lib/server/result.js";
import {
    ADMIN_SESSION_COOKIE,
    destroyAdminSession
} from "$lib/server/admin-auth.js";

export const prerender = false;

export const POST = handleRoute(async ({ cookies }) => {
    const token = cookies.get(ADMIN_SESSION_COOKIE);

    destroyAdminSession(token);
    cookies.delete(ADMIN_SESSION_COOKIE, { path: "/" });

    return jsonOk({ loggedOut: true });
});
