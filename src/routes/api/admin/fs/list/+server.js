import { handleRoute, jsonOk } from "$lib/server/result.js";
import { optionalInt } from "$lib/server/http.js";
import { list } from "$lib/server/baidu.js";
import { normalizePath } from "$lib/server/permissions.js";

export const prerender = false;

export const GET = handleRoute(async ({ url }) => {
    const dir = url.searchParams.get("dir") ?? "/";
    const start =
        optionalInt(url.searchParams.get("start"), "start", { min: 0 }) ?? 0;
    const limit =
        optionalInt(url.searchParams.get("limit"), "limit", {
            min: 1,
            max: 1000
        }) ?? 1000;

    const result = await list(dir, start, limit);

    return jsonOk({
        dir: normalizePath(dir),
        entries: result.entries,
        hasMore: result.hasMore
    });
});
