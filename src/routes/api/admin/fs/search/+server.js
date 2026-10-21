import { handleRoute, jsonOk, AppError, ERROR_CODES } from "$lib/server/result.js";
import { search } from "$lib/server/baidu.js";
import { normalizePath } from "$lib/server/permissions.js";

// WHAT: 管理端接口依赖运行时设置，禁止预渲染
export const prerender = false;

// WHAT: 搜索结果条数上限
const MAX_RESULTS = 100;

export const GET = handleRoute(async ({ url }) => {
    const keyword = url.searchParams.get("key");

    if (keyword === null || keyword.trim() === "") {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "key 不能为空",
            400
        );
    }

    const dirParam = url.searchParams.get("dir");
    const dir =
        dirParam === null || dirParam.trim() === ""
            ? null
            : normalizePath(dirParam);

    let entries = await search(keyword);

    if (dir !== null && dir !== "/") {
        entries = entries.filter(
            (entry) =>
                entry.path === dir || entry.path.startsWith(`${dir}/`)
        );
    }

    entries = entries.slice(0, MAX_RESULTS);

    return jsonOk({ keyword, entries });
});
