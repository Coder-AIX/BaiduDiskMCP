import { handleRoute, jsonOk } from "$lib/server/result.js";
import { parseId } from "$lib/server/http.js";
import { revokeUploadLink } from "$lib/server/upload-links.js";

export const prerender = false;

export const DELETE = handleRoute(async ({ params }) => {
    const id = parseId(params.id);
    revokeUploadLink(id);

    return jsonOk({ deleted: true });
});
