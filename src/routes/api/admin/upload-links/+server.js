import { jsonOk, handleRoute } from "$lib/server/result.js";
import { optionalInt } from "$lib/server/http.js";
import { listUploadLinks } from "$lib/server/upload-links.js";

export const prerender = false;

export const GET = handleRoute(async ({ url }) => {
    const userId = optionalInt(url.searchParams.get("userId") ?? undefined, "userId", {
        min: 1
    });

    const links = listUploadLinks(userId);

    return jsonOk(links);
});
