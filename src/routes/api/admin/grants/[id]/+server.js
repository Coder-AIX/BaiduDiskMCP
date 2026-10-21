import { jsonOk, handleRoute } from "$lib/server/result.js";
import { readJson, requireOneOf, parseId } from "$lib/server/http.js";
import { updateGrant, removeGrant } from "$lib/server/permissions.js";

export const prerender = false;

export const PATCH = handleRoute(async ({ params, request }) => {
    const id = parseId(params.id);
    const body = await readJson(request);
    const level = requireOneOf(body.level, ["view", "edit", "manage"], "level");
    const grant = updateGrant(id, level);

    return jsonOk(grant);
});

export const DELETE = handleRoute(async ({ params }) => {
    const id = parseId(params.id);

    removeGrant(id);

    return jsonOk({ deleted: true });
});
