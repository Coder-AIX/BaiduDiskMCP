import { jsonOk, handleRoute } from "$lib/server/result.js";
import { readJson, requireString } from "$lib/server/http.js";
import { listUsers, createUser } from "$lib/server/users.js";

export const prerender = false;

export const GET = handleRoute(async () => {
    return jsonOk(listUsers());
});

export const POST = handleRoute(async ({ request }) => {
    const body = await readJson(request);
    const name = requireString(body, "name");
    const user = createUser(name);

    return jsonOk(user, 201);
});
