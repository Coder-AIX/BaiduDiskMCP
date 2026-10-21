import { handleRoute, AppError, ERROR_CODES } from "$lib/server/result.js";
import { createDownloadResponse } from "$lib/server/download.js";

export const prerender = false;

export const GET = handleRoute(async ({ url, request }) => {
    const path = url.searchParams.get("path");

    if (!path) {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "path 不能为空",
            400
        );
    }

    return createDownloadResponse(path, request);
});
