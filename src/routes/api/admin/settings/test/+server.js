import { handleRoute, jsonOk } from "$lib/server/result.js";
import { list } from "$lib/server/baidu.js";

export const prerender = false;

export const POST = handleRoute(async () => {
    const result = await list("/", 0, 1);

    return jsonOk({
        connected: true,
        sampleCount: result.entries.length
    });
});
