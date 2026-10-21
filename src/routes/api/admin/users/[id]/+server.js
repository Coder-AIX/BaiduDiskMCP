import {
    jsonOk,
    handleRoute,
    AppError,
    ERROR_CODES
} from "$lib/server/result.js";
import { readJson, optionalString, parseId } from "$lib/server/http.js";
import { getUser, updateUser, deleteUser } from "$lib/server/users.js";
import { listGrants } from "$lib/server/permissions.js";

export const prerender = false;

function notFound(id) {
    return new AppError(ERROR_CODES.NOT_FOUND, `用户 ${id} 不存在`, 404);
}

function requireUser(id) {
    const user = getUser(id);

    if (!user) {
        throw notFound(id);
    }

    return user;
}

export const GET = handleRoute(async ({ params }) => {
    const id = parseId(params.id);
    const user = requireUser(id);

    return jsonOk({ user, grants: listGrants(id) });
});

export const PATCH = handleRoute(async ({ params, request }) => {
    const id = parseId(params.id);
    const body = await readJson(request);

    requireUser(id);

    const name = optionalString(body, "name");
    let enabled;

    if (Object.prototype.hasOwnProperty.call(body, "enabled")) {
        if (typeof body.enabled !== "boolean") {
            throw new AppError(
                ERROR_CODES.INVALID_ARGUMENT,
                "enabled 必须是布尔值"
            );
        }

        enabled = body.enabled;
    }

    const user = updateUser(id, { name, enabled });

    return jsonOk({ user });
});

export const DELETE = handleRoute(async ({ params }) => {
    const id = parseId(params.id);

    deleteUser(id);

    return jsonOk({ deleted: true });
});
