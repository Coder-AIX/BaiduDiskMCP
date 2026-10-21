import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import Busboy from "busboy";
import {
    getUploadLink,
    claimUploadLink,
    releaseUploadLink
} from "$lib/server/upload-links.js";
import { getUser } from "$lib/server/users.js";
import {
    requireLevel,
    joinPath,
    validateName,
    normalizePath
} from "$lib/server/permissions.js";
import { getNumberSetting } from "$lib/server/settings.js";
import { uploadFile } from "$lib/server/baidu.js";
import {
    handleRoute,
    jsonOk,
    AppError,
    ERROR_CODES
} from "$lib/server/result.js";

export const prerender = false;

const DEFAULT_MAX_UPLOAD_SIZE = 2147483648;
const TEMP_DIR = path.join(process.cwd(), "data", "tmp");

function linkNotFound() {
    return new AppError(ERROR_CODES.NOT_FOUND, "上传短链不存在", 404);
}

function missingFileName() {
    return new AppError(
        ERROR_CODES.INVALID_ARGUMENT,
        "缺少文件名，请通过 query name、X-File-Name 或短链指定",
        400
    );
}

function tooLarge(maxUploadSize) {
    return new AppError(
        ERROR_CODES.INVALID_ARGUMENT,
        "文件超过上传大小上限",
        413,
        { maxUploadSize }
    );
}

async function receiveMultipart({ request, tempPath, maxUploadSize }) {
    const headers = Object.fromEntries(request.headers.entries());
    let busboy;

    try {
        busboy = Busboy({
            headers,
            defParamCharset: "utf8",
            limits: {
                files: 1,
                fileSize: maxUploadSize
            }
        });
    } catch {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "multipart 请求格式无效",
            400
        );
    }

    let fileName = null;
    let fileCount = 0;
    let limitError = null;
    const writeTasks = [];

    busboy.on("file", (fieldName, fileStream, info) => {
        fileCount += 1;

        if (fileCount > 1) {
            fileStream.resume();
            return;
        }

        fileName = info?.filename ?? null;

        const output = createWriteStream(tempPath);

        fileStream.on("limit", () => {
            limitError = tooLarge(maxUploadSize);
            output.destroy(limitError);
        });

        const task = pipeline(fileStream, output);

        task.catch(() => {});
        writeTasks.push(task);
    });

    const source = Readable.fromWeb(request.body);
    let sourceError = null;

    try {
        await pipeline(source, busboy);
    } catch (error) {
        sourceError = error;
    }

    const results = await Promise.allSettled(writeTasks);
    const writeFailure = results.find(
        (result) => result.status === "rejected"
    );

    if (limitError) {
        throw limitError;
    }

    if (writeFailure) {
        throw writeFailure.reason;
    }

    if (sourceError) {
        throw sourceError;
    }

    if (fileCount === 0) {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "multipart 请求缺少文件",
            400
        );
    }

    if (typeof fileName !== "string" || fileName.trim() === "") {
        throw missingFileName();
    }

    return fileName;
}

async function receiveRaw({ request, tempPath, maxUploadSize }) {
    if (!request.body) {
        throw new AppError(ERROR_CODES.INVALID_ARGUMENT, "请求体为空", 400);
    }

    let total = 0;
    let limitError = null;

    const counter = new Transform({
        transform(chunk, encoding, callback) {
            total += chunk.length;

            if (total > maxUploadSize) {
                limitError = tooLarge(maxUploadSize);
                callback(limitError);
                return;
            }

            callback(null, chunk);
        }
    });

    const source = Readable.fromWeb(request.body);
    const output = createWriteStream(tempPath);

    try {
        await pipeline(source, counter, output);
    } catch (error) {
        if (limitError) {
            throw limitError;
        }

        throw error;
    }
}

export const GET = handleRoute(async ({ params }) => {
    const link = getUploadLink(params.token);

    if (!link) {
        throw linkNotFound();
    }

    return jsonOk({
        targetDir: link.targetDir,
        fileName: link.fileName,
        expiresAt: link.expiresAt,
        status: link.status
    });
});

export const POST = handleRoute(async ({ params, request, url }) => {
    const link = getUploadLink(params.token);

    if (!link) {
        throw linkNotFound();
    }

    if (link.status === "used") {
        throw new AppError(
            ERROR_CODES.CONFLICT,
            "上传短链已被使用",
            409
        );
    }

    if (link.status === "expired") {
        throw new AppError(
            ERROR_CODES.UPLOAD_EXPIRED,
            "上传短链已过期",
            410
        );
    }

    const user = getUser(link.userId);

    if (!user || user.enabled === false) {
        throw new AppError(
            ERROR_CODES.FORBIDDEN,
            "用户不存在或已被禁用",
            403
        );
    }

    const targetDir = normalizePath(link.targetDir);

    requireLevel(link.userId, targetDir, "edit");

    const maxUploadSize = getNumberSetting(
        "max_upload_size",
        DEFAULT_MAX_UPLOAD_SIZE
    );
    const contentType = (
        request.headers.get("content-type") ?? ""
    ).toLowerCase();
    const isMultipart = contentType.startsWith("multipart/form-data");

    let fileName = null;
    let remotePath = null;

    if (!isMultipart) {
        const candidate =
            url.searchParams.get("name") ||
            request.headers.get("x-file-name") ||
            link.fileName ||
            "";

        fileName = candidate.trim();

        if (!fileName) {
            throw missingFileName();
        }

        fileName = validateName(fileName);
        remotePath = joinPath(targetDir, fileName);

        const declaredLength = Number(
            request.headers.get("content-length")
        );

        if (
            Number.isFinite(declaredLength) &&
            declaredLength > maxUploadSize
        ) {
            throw tooLarge(maxUploadSize);
        }
    }

    claimUploadLink(link.id);

    const tempPath = path.join(
        TEMP_DIR,
        `upload-${randomBytes(16).toString("hex")}.bin`
    );
    let completed = false;

    try {
        await fs.mkdir(TEMP_DIR, { recursive: true });

        if (isMultipart) {
            const receivedName = await receiveMultipart({
                request,
                tempPath,
                maxUploadSize
            });

            fileName = validateName(receivedName);
            remotePath = joinPath(targetDir, fileName);
        } else {
            await receiveRaw({ request, tempPath, maxUploadSize });
        }

        const result = await uploadFile(tempPath, remotePath);

        completed = true;

        return jsonOk(result);
    } catch (error) {
        if (!completed) {
            releaseUploadLink(link.id);
        }

        if (error instanceof AppError) {
            throw error;
        }

        const aborted =
            error?.name === "AbortError" ||
            error?.code === "ECONNRESET";

        throw new AppError(
            aborted
                ? ERROR_CODES.INVALID_ARGUMENT
                : ERROR_CODES.INTERNAL_ERROR,
            aborted ? "上传连接已中断" : "上传失败",
            aborted ? 400 : 500
        );
    } finally {
        await fs.rm(tempPath, { force: true }).catch(() => {});
    }
});
