import { handleRoute, jsonOk } from "$lib/server/result.js";
import { parseId } from "$lib/server/http.js";
import { regenerateKey } from "$lib/server/users.js";

export const prerender = false;

export const POST = handleRoute(async ({ params }) => {
    const id = parseId(params.id);
    const result = regenerateKey(id);

    return jsonOk({
        id: result.id,
        apiKey: result.apiKey
    });
});
