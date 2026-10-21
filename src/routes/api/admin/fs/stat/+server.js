import { handleRoute, jsonOk, AppError, ERROR_CODES } from "$lib/server/result.js";
import { statByPath } from "$lib/server/baidu.js";

export const prerender = false;

export const GET = handleRoute(async ({ url }) => {
    const path = url.searchParams.get("path");

    if (!path || path.trim() === "") {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "path 不能为空",
            400
        );
    }

    const entry = await statByPath(path);

    return jsonOk(entry);
});
