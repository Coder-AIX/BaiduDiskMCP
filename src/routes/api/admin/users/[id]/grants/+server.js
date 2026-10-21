import { handleRoute, jsonOk, AppError, ERROR_CODES } from "$lib/server/result.js";
import { readJson, requireString, requireOneOf, parseId } from "$lib/server/http.js";
import { getUser } from "$lib/server/users.js";
import { listGrants, addGrant } from "$lib/server/permissions.js";

export const prerender = false;

const LEVELS = ["view", "edit", "manage"];

function requireUser(id) {
    const user = getUser(id);

    if (!user) {
        throw new AppError(
            ERROR_CODES.NOT_FOUND,
            `用户 ${id} 不存在`,
            404,
            { id }
        );
    }

    return user;
}

export const GET = handleRoute(async ({ params }) => {
    const id = parseId(params.id);
    requireUser(id);

    return jsonOk(listGrants(id));
});

export const POST = handleRoute(async ({ params, request }) => {
    const id = parseId(params.id);
    requireUser(id);

    const body = await readJson(request);
    const path = requireString(body, "path");
    const level = requireOneOf(body.level, LEVELS, "level");

    return jsonOk(addGrant(id, path, level));
});
