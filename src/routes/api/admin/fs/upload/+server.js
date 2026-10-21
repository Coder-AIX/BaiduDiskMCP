import Busboy from "busboy";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
    handleRoute,
    jsonOk,
    AppError,
    ERROR_CODES
} from "$lib/server/result.js";
import { getNumberSetting } from "$lib/server/settings.js";
import {
    normalizePath,
    validateName,
    joinPath
} from "$lib/server/permissions.js";
import { uploadFile } from "$lib/server/baidu.js";

const DEFAULT_MAX_UPLOAD_SIZE = 2147483648;

function invalid(message, details) {
    return new AppError(ERROR_CODES.INVALID_ARGUMENT, message, 400, details);
}

function receiveUpload(request, tempPath, maxUploadSize) {
    return new Promise((resolve, reject) => {
        let busboy;

        try {
            busboy = Busboy({
                headers: Object.fromEntries(request.headers.entries()),
                defParamCharset: "utf8",
                limits: {
                    files: 1,
                    fileSize: maxUploadSize
                }
            });
        } catch {
            reject(invalid("multipart/form-data 请求格式无效"));
            return;
        }

        const source = Readable.fromWeb(request.body);
        let dir = null;
        let fileName = null;
        let fileSeen = false;
        let limitExceeded = false;
        let writeDone = null;
        let settled = false;

        const fail = (error) => {
            if (settled) {
                return;
            }

            settled = true;
            source.destroy();
            reject(error);
        };

        busboy.on("field", (name, value) => {
            if (name === "dir") {
                dir = value;
            }
        });

        busboy.on("file", (name, stream, info) => {
            if (name !== "file" || fileSeen) {
                stream.resume();
                return;
            }

            fileSeen = true;
            fileName = info.filename;

            const writeStream = createWriteStream(tempPath);

            writeDone = new Promise((resolveWrite, rejectWrite) => {
                writeStream.on("finish", resolveWrite);
                writeStream.on("error", rejectWrite);
            });

            stream.on("limit", () => {
                limitExceeded = true;
            });

            stream.on("error", () => {
                writeStream.destroy();
                fail(
                    new AppError(
                        ERROR_CODES.INTERNAL_ERROR,
                        "读取上传文件失败",
                        500
                    )
                );
            });

            writeStream.on("error", () => {
                fail(
                    new AppError(
                        ERROR_CODES.INTERNAL_ERROR,
                        "写入临时文件失败",
                        500
                    )
                );
            });

            stream.pipe(writeStream);
        });

        busboy.on("error", () => {
            fail(invalid("multipart/form-data 请求解析失败"));
        });

        source.on("error", () => {
            fail(
                new AppError(
                    ERROR_CODES.INTERNAL_ERROR,
                    "读取请求体失败",
                    500
                )
            );
        });

        busboy.on("close", async () => {
            if (settled) {
                return;
            }

            if (writeDone) {
                try {
                    await writeDone;
                } catch {
                    fail(
                        new AppError(
                            ERROR_CODES.INTERNAL_ERROR,
                            "写入临时文件失败",
                            500
                        )
                    );
                    return;
                }
            }

            if (settled) {
                return;
            }

            if (limitExceeded) {
                fail(
                    new AppError(
                        ERROR_CODES.INVALID_ARGUMENT,
                        `文件超过大小上限（${maxUploadSize} 字节）`,
                        413,
                        { maxUploadSize }
                    )
                );
                return;
            }

            settled = true;
            resolve({ dir, fileName, fileSeen });
        });

        source.pipe(busboy);
    });
}

export const prerender = false;

export const POST = handleRoute(async ({ request }) => {
    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
        throw invalid("Content-Type 必须是 multipart/form-data");
    }

    if (!request.body) {
        throw invalid("请求体不能为空");
    }

    const configured = getNumberSetting(
        "max_upload_size",
        DEFAULT_MAX_UPLOAD_SIZE
    );
    const maxUploadSize =
        Number.isFinite(configured) && configured > 0
            ? Math.floor(configured)
            : DEFAULT_MAX_UPLOAD_SIZE;

    const tmpDir = path.resolve(process.cwd(), "data", "tmp");

    await mkdir(tmpDir, { recursive: true });

    const tempPath = path.join(
        tmpDir,
        `admin-${randomBytes(16).toString("hex")}.bin`
    );

    try {
        const { dir, fileName, fileSeen } = await receiveUpload(
            request,
            tempPath,
            maxUploadSize
        );

        if (typeof dir !== "string" || dir.trim() === "") {
            throw invalid("dir 不能为空");
        }

        if (!fileSeen || typeof fileName !== "string" || fileName.trim() === "") {
            throw invalid("file 不能为空");
        }

        const normalizedDir = normalizePath(dir);
        const safeName = validateName(fileName);
        const remotePath = joinPath(normalizedDir, safeName);

        const result = await uploadFile(tempPath, remotePath);

        return jsonOk(result);
    } finally {
        await rm(tempPath, { force: true }).catch(() => {});
    }
});
