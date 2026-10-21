import { handleRoute, AppError, ERROR_CODES } from "$lib/server/result.js";
import {
    getDownloadLink,
    isDownloadLinkActive
} from "$lib/server/download-links.js";
import { createDownloadResponse } from "$lib/server/download.js";
import { getUser } from "$lib/server/users.js";
import { requireLevel } from "$lib/server/permissions.js";

export const prerender = false;

export const GET = handleRoute(async ({ params, request }) => {
    const token = params.token;
    const link = getDownloadLink(token);

    if (!link) {
        throw new AppError(ERROR_CODES.NOT_FOUND, "下载短链不存在", 404);
    }

    if (!isDownloadLinkActive(link)) {
        throw new AppError(ERROR_CODES.UPLOAD_EXPIRED, "下载短链已过期", 410);
    }

    const user = getUser(link.userId);

    if (!user || user.enabled === false) {
        throw new AppError(
            ERROR_CODES.FORBIDDEN,
            "用户不存在或已被禁用",
            403
        );
    }

    requireLevel(link.userId, link.path, "view");

    return createDownloadResponse(link.path, request);
});
