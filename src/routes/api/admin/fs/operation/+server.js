import {
    handleRoute,
    jsonOk,
    AppError,
    ERROR_CODES
} from "$lib/server/result.js";
import {
    readJson,
    requireString,
    optionalString,
    requireOneOf
} from "$lib/server/http.js";
import { joinPath, validateName } from "$lib/server/permissions.js";
import {
    createFolder,
    rename,
    move,
    copy,
    remove
} from "$lib/server/baidu.js";

export const prerender = false;

// WHAT: 管理端文件操作 op 白名单，顺序与文档一致
const OPERATIONS = ["mkdir", "rename", "move", "copy", "delete"];

function invalidPaths() {
    return new AppError(
        ERROR_CODES.INVALID_ARGUMENT,
        "paths 必须是非空字符串数组"
    );
}

function requirePaths(body) {
    const paths = body?.paths;

    if (!Array.isArray(paths) || paths.length === 0) {
        throw invalidPaths();
    }

    const result = [];

    for (const path of paths) {
        if (typeof path !== "string" || path.trim() === "") {
            throw invalidPaths();
        }

        result.push(path);
    }

    return [...new Set(result)];
}

export const POST = handleRoute(async ({ request }) => {
    const body = await readJson(request);
    const op = requireOneOf(body.op, OPERATIONS, "op");

    if (op === "mkdir") {
        const dir = requireString(body, "dir");
        const name = validateName(requireString(body, "name"));
        const result = await createFolder(joinPath(dir, name));

        return jsonOk(result);
    }

    if (op === "rename") {
        const path = requireString(body, "path");
        const newName = requireString(body, "newName");
        const result = await rename(path, newName);

        return jsonOk(result);
    }

    if (op === "move") {
        const path = requireString(body, "path");
        const destDir = requireString(body, "destDir");
        const newName = optionalString(body, "newName");
        const result = await move(path, destDir, newName);

        return jsonOk(result);
    }

    if (op === "copy") {
        const path = requireString(body, "path");
        const destDir = requireString(body, "destDir");
        const newName = optionalString(body, "newName");
        const result = await copy(path, destDir, newName);

        return jsonOk(result);
    }

    const paths = requirePaths(body);
    const result = await remove(paths);

    return jsonOk(result);
});
