import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { getSetting } from "./settings.js";
import {
    normalizePath,
    parentPath,
    baseName,
    validateName
} from "./permissions.js";
import { AppError, ERROR_CODES } from "./result.js";

// WHAT: 百度网盘开放平台 XPAN 接口根地址
const API_BASE = "https://pan.baidu.com/rest/2.0/xpan";
// WHAT: PCS 分片上传接口地址，分片接口不在 XPAN 下
const PCS_UPLOAD_BASE = "https://d.pcs.baidu.com/rest/2.0/pcs/superfile2";
// WHAT: 百度接口与下载地址强制要求的 User-Agent
const USER_AGENT = "pan.baidu.com";
// WHAT: 单个上传分片大小（4MB），block_list 顺序必须与此一致
const UPLOAD_PART_SIZE = 4 * 1024 * 1024;
// WHAT: 目录列表单页条数上限
const LIST_PAGE_SIZE = 1000;
// WHAT: 普通接口默认超时（毫秒）
const DEFAULT_TIMEOUT = 30000;
// WHAT: 预上传、分片上传与合并接口的超时（毫秒）
const UPLOAD_TIMEOUT = 120000;
// WHAT: 错误详情中保留的响应文本最大长度，避免错误对象膨胀
const MAX_ERROR_BODY = 500;

// WHAT: 常见百度 errno 到中文提示的映射，未收录的按原始 errmsg 展示
const ERRNO_MESSAGES = {
    "-1": "系统错误",
    "2": "参数错误",
    "-6": "鉴权失败",
    "-7": "文件不存在",
    "-8": "文件名非法",
    "-9": "文件已存在",
    "12": "批量操作部分失败",
    "111": "有其他操作"
};

function redactToken(text) {
    return String(text ?? "").replace(/(access_token=)[^&\s"'#]+/gi, "$1***");
}

function truncate(text) {
    const value = typeof text === "string" ? text : String(text ?? "");

    if (value.length <= MAX_ERROR_BODY) {
        return value;
    }

    return `${value.slice(0, MAX_ERROR_BODY)}…`;
}

function sanitizeDetails(details) {
    const seen = new WeakSet();

    return JSON.parse(
        JSON.stringify(details ?? {}, (key, value) => {
            if (key && key.toLowerCase().includes("token")) {
                return undefined;
            }

            if (value instanceof Error) {
                return {
                    name: value.name,
                    message: redactToken(value.message)
                };
            }

            if (typeof value === "string") {
                return redactToken(value);
            }

            if (value && typeof value === "object") {
                if (seen.has(value)) {
                    return undefined;
                }

                seen.add(value);
            }

            return value;
        })
    );
}

function describeErrno(errno, errmsg) {
    if (errmsg) {
        return redactToken(errmsg);
    }

    if (errno === null || errno === undefined) {
        return "百度接口返回错误";
    }

    const mapped = ERRNO_MESSAGES[String(errno)];

    if (mapped) {
        return mapped;
    }

    return `百度接口错误（errno ${errno}）`;
}

function getAccessToken() {
    const token = getSetting("baidu_access_token");

    if (typeof token !== "string" || token.trim() === "") {
        throw new AppError(
            ERROR_CODES.BAIDU_ERROR,
            "尚未配置百度 access_token",
            400
        );
    }

    return token.trim();
}

export class BaiduError extends AppError {
    constructor(message, { errno, errmsg, requestId, api, details } = {}) {
        const parsedErrno =
            errno === undefined || errno === null ? null : Number(errno);
        const finalErrno = Number.isFinite(parsedErrno) ? parsedErrno : null;

        super(
            ERROR_CODES.BAIDU_ERROR,
            message || describeErrno(finalErrno, errmsg),
            502,
            sanitizeDetails({
                errno: finalErrno,
                errmsg: errmsg ?? null,
                requestId: requestId ?? null,
                api: api ?? null,
                ...(details ?? {})
            })
        );

        this.name = "BaiduError";
        this.errno = finalErrno;
        this.errmsg = errmsg ?? null;
        this.requestId = requestId ?? null;
        this.api = api ?? null;
    }
}

async function request(pathname, options = {}) {
    const token = getAccessToken();
    const method = options.method ?? "GET";
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const api = options.api ?? `${method} ${pathname}`;
    const url = new URL(`${API_BASE}${pathname}`);

    url.searchParams.set("access_token", token);

    for (const [key, value] of Object.entries(options.query ?? {})) {
        if (value === undefined || value === null || value === "") {
            continue;
        }

        url.searchParams.set(key, String(value));
    }

    const init = {
        method,
        headers: {
            "user-agent": USER_AGENT
        },
        signal: AbortSignal.timeout(timeout)
    };

    if (method === "POST") {
        const body = new URLSearchParams();

        for (const [key, value] of Object.entries(options.body ?? {})) {
            if (value === undefined || value === null) {
                continue;
            }

            body.append(key, String(value));
        }

        init.headers["content-type"] = "application/x-www-form-urlencoded";
        init.body = body.toString();
    }

    let response;

    try {
        response = await fetch(url, init);
    } catch (error) {
        const isTimeout = error?.name === "TimeoutError";
        const message = isTimeout
            ? `百度接口请求超时（${timeout}ms）`
            : "百度接口请求失败";

        throw new BaiduError(message, {
            api,
            details: {
                reason: redactToken(error?.message ?? String(error)),
                timeout
            }
        });
    }

    let text;

    try {
        text = await response.text();
    } catch (error) {
        throw new BaiduError("百度接口响应读取失败", {
            api,
            details: {
                reason: redactToken(error?.message ?? String(error)),
                status: response.status
            }
        });
    }

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new BaiduError("百度接口返回了非 JSON 响应", {
            errno: response.status,
            api,
            details: {
                status: response.status,
                body: truncate(text)
            }
        });
    }

    if (data === null || typeof data !== "object") {
        throw new BaiduError("百度接口返回了非 JSON 响应", {
            errno: response.status,
            api,
            details: {
                status: response.status,
                body: truncate(text)
            }
        });
    }

    const rawErrno = data.errno ?? data.error_code;
    const errno =
        rawErrno === undefined || rawErrno === null ? 0 : Number(rawErrno);
    const errmsg = data.errmsg ?? data.error_msg ?? null;
    const requestId = data.request_id ?? data.requestId ?? null;

    if (Number.isFinite(errno) && errno !== 0) {
        throw new BaiduError(describeErrno(errno, errmsg), {
            errno,
            errmsg,
            requestId,
            api,
            details: {
                pathname
            }
        });
    }

    if (!response.ok) {
        throw new BaiduError(`百度接口请求失败（HTTP ${response.status}）`, {
            errno: response.status,
            requestId,
            api,
            details: {
                status: response.status,
                body: truncate(text)
            }
        });
    }

    return data;
}

function normalizeEntry(item) {
    const path = item.path ? normalizePath(item.path) : "/";
    const name =
        item.server_filename ?? item.filename ?? baseName(path);

    return {
        fsId: item.fs_id ?? 0,
        name,
        path,
        isDir: Boolean(item.isdir),
        size: Number(item.size ?? 0),
        mtime: Number(item.server_mtime ?? item.mtime ?? 0),
        md5: item.md5 ?? null
    };
}

export async function list(dir = "/", start = 0, limit = LIST_PAGE_SIZE) {
    const normalized = normalizePath(dir);
    const data = await request("/file", {
        query: {
            method: "list",
            dir: normalized,
            start,
            limit,
            web: 1
        },
        api: "method=list"
    });

    const entries = (Array.isArray(data.list) ? data.list : []).map(
        normalizeEntry
    );

    return {
        entries,
        hasMore: entries.length === limit
    };
}

export async function listAll(dir = "/") {
    const normalized = normalizePath(dir);
    const entries = [];
    let start = 0;

    while (true) {
        const page = await list(normalized, start, LIST_PAGE_SIZE);

        entries.push(...page.entries);

        if (!page.hasMore || page.entries.length === 0) {
            break;
        }

        start += LIST_PAGE_SIZE;
    }

    return entries;
}

export async function search(keyword, page = 1, num = 100) {
    const data = await request("/file", {
        query: {
            method: "search",
            key: keyword,
            recursion: 1,
            web: 1,
            page,
            num
        },
        api: "method=search"
    });

    return (Array.isArray(data.list) ? data.list : []).map(normalizeEntry);
}

export async function statByPath(path) {
    const normalized = normalizePath(path);

    if (normalized === "/") {
        return {
            fsId: 0,
            name: "",
            path: "/",
            isDir: true,
            size: 0,
            mtime: 0,
            md5: null
        };
    }

    // 百度没有按路径查询文件的接口，只能列父目录后本地匹配
    const entries = await listAll(parentPath(normalized));
    const name = baseName(normalized);
    const found =
        entries.find((entry) => entry.path === normalized) ??
        entries.find((entry) => entry.name === name);

    if (!found) {
        throw new AppError(
            ERROR_CODES.NOT_FOUND,
            "文件或目录不存在",
            404,
            { path: normalized }
        );
    }

    return found;
}

export async function getDownloadLink(path) {
    const entry = await statByPath(path);

    if (entry.isDir) {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "不能下载目录",
            400,
            { path: entry.path }
        );
    }

    const data = await request("/multimedia", {
        query: {
            method: "filemetas",
            fsids: JSON.stringify([entry.fsId]),
            dlink: 1,
            thumb: 0
        },
        api: "method=filemetas"
    });

    const info = Array.isArray(data.list) ? data.list[0] : null;

    if (!info || !info.dlink) {
        throw new BaiduError("百度未返回文件下载地址", {
            requestId: data.request_id ?? null,
            api: "method=filemetas",
            details: { path: entry.path }
        });
    }

    // 百度下载地址必须附带 access_token，这里是唯一允许输出 token 的位置
    const token = getAccessToken();
    const separator = info.dlink.includes("?") ? "&" : "?";
    const url = `${info.dlink}${separator}access_token=${encodeURIComponent(token)}`;

    return {
        url,
        fsId: entry.fsId,
        name: info.server_filename ?? info.filename ?? entry.name,
        size: Number(info.size ?? entry.size),
        md5: info.md5 ?? entry.md5 ?? null
    };
}

export async function createFolder(path) {
    const normalized = normalizePath(path);

    if (normalized === "/") {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "不能在根目录创建文件夹",
            400,
            { path: normalized }
        );
    }

    validateName(baseName(normalized));

    return request("/file", {
        method: "POST",
        query: { method: "create" },
        body: {
            path: normalized,
            isdir: 1,
            size: 0,
            rtype: 1
        },
        api: "method=create"
    });
}

async function fileManager(opera, fileList) {
    const api = `method=filemanager&opera=${opera}`;
    const data = await request("/file", {
        method: "POST",
        query: {
            method: "filemanager",
            opera,
            async: 0
        },
        body: {
            filelist: JSON.stringify(fileList)
        },
        api
    });

    const info = Array.isArray(data.info) ? data.info : [];
    const failed = info
        .map((item) => ({
            path: item.path ?? null,
            errno: Number(item.errno ?? 0),
            errmsg: item.errmsg ?? null
        }))
        .filter((item) => Number.isFinite(item.errno) && item.errno !== 0);

    if (failed.length > 0) {
        const first = failed[0];

        throw new BaiduError(describeErrno(first.errno, first.errmsg), {
            errno: first.errno,
            errmsg: first.errmsg,
            requestId: data.request_id ?? null,
            api,
            details: {
                failed
            }
        });
    }

    return data;
}

export async function rename(path, newName) {
    const source = normalizePath(path);
    const name = validateName(newName);

    return fileManager("rename", [
        {
            path: source,
            newname: name
        }
    ]);
}

export async function move(path, destDir, newName) {
    const source = normalizePath(path);
    const dest = normalizePath(destDir);
    const name = validateName(newName ?? baseName(source));

    return fileManager("move", [
        {
            path: source,
            dest,
            newname: name
        }
    ]);
}

export async function copy(path, destDir, newName) {
    const source = normalizePath(path);
    const dest = normalizePath(destDir);
    const name = validateName(newName ?? baseName(source));

    return fileManager("copy", [
        {
            path: source,
            dest,
            newname: name
        }
    ]);
}

export async function remove(paths) {
    if (!Array.isArray(paths) || paths.length === 0) {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "paths 必须是非空数组",
            400
        );
    }

    const normalized = [...new Set(paths.map((path) => normalizePath(path)))];

    if (normalized.includes("/")) {
        throw new AppError(
            ERROR_CODES.INVALID_ARGUMENT,
            "不能删除根目录",
            400,
            { path: "/" }
        );
    }

    return fileManager(
        "delete",
        normalized.map((path) => ({ path }))
    );
}

async function readPart(handle, length, position, localPath) {
    const buffer = Buffer.allocUnsafe(length);
    let filled = 0;

    // 单次 read 可能短读，必须循环读满，否则分片 MD5 与上传内容会不一致
    while (filled < length) {
        const { bytesRead } = await handle.read(
            buffer,
            filled,
            length - filled,
            position + filled
        );

        if (bytesRead === 0) {
            throw new AppError(
                ERROR_CODES.INTERNAL_ERROR,
                "读取本地文件时提前结束",
                500,
                {
                    path: localPath,
                    offset: position + filled
                }
            );
        }

        filled += bytesRead;
    }

    return buffer;
}

function buildUploadUrl(token, path, uploadid, partseq) {
    const url = new URL(PCS_UPLOAD_BASE);

    url.searchParams.set("method", "upload");
    url.searchParams.set("type", "tmpfile");
    url.searchParams.set("path", path);
    url.searchParams.set("uploadid", uploadid);
    url.searchParams.set("partseq", String(partseq));
    url.searchParams.set("access_token", token);

    return url;
}

async function uploadChunk({ token, path, uploadid, partseq, buffer }) {
    const api = "method=upload";
    const url = buildUploadUrl(token, path, uploadid, partseq);
    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        let response;

        try {
            const form = new FormData();

            form.append("file", new Blob([buffer]), "blob");

            response = await fetch(url, {
                method: "POST",
                headers: {
                    "user-agent": USER_AGENT
                },
                body: form,
                signal: AbortSignal.timeout(UPLOAD_TIMEOUT)
            });
        } catch (error) {
            lastError = error;
            continue;
        }

        let text;

        try {
            text = await response.text();
        } catch (error) {
            lastError = error;
            continue;
        }

        if (response.status >= 500) {
            lastError = new BaiduError(
                `百度分片上传失败（HTTP ${response.status}）`,
                {
                    errno: response.status,
                    api,
                    details: {
                        partseq,
                        body: truncate(text)
                    }
                }
            );
            continue;
        }

        let data;

        try {
            data = JSON.parse(text);
        } catch {
            throw new BaiduError("百度分片上传返回了非 JSON 响应", {
                api,
                details: {
                    partseq,
                    status: response.status,
                    body: truncate(text)
                }
            });
        }

        const rawErrno = data.error_code ?? data.errno;
        const errno =
            rawErrno === undefined || rawErrno === null
                ? 0
                : Number(rawErrno);
        const errmsg = data.error_msg ?? data.errmsg ?? null;

        if (Number.isFinite(errno) && errno !== 0) {
            throw new BaiduError(describeErrno(errno, errmsg), {
                errno,
                errmsg,
                requestId: data.request_id ?? null,
                api,
                details: {
                    partseq,
                    partmd5: data.md5 ?? null
                }
            });
        }

        if (!response.ok) {
            throw new BaiduError(
                `百度分片上传失败（HTTP ${response.status}）`,
                {
                    errno: response.status,
                    api,
                    details: {
                        partseq,
                        body: truncate(text)
                    }
                }
            );
        }

        return data;
    }

    if (lastError instanceof BaiduError) {
        throw lastError;
    }

    throw new BaiduError("百度分片上传网络错误", {
        api,
        details: {
            partseq,
            reason: redactToken(lastError?.message ?? String(lastError ?? ""))
        }
    });
}

async function uploadParts(localPath, remote, uploadid, md5List, size, token) {
    const handle = await fs.open(localPath, "r");

    try {
        let offset = 0;

        // 顺序上传，不做并发：百度接口有频率限制，顺序足够且实现简单
        for (let partseq = 0; partseq < md5List.length; partseq += 1) {
            const length = Math.min(UPLOAD_PART_SIZE, size - offset);
            const buffer = await readPart(handle, length, offset, localPath);

            await uploadChunk({
                token,
                path: remote,
                uploadid,
                partseq,
                buffer
            });

            offset += length;
        }
    } finally {
        await handle.close();
    }
}

export async function uploadFile(localPath, remotePath) {
    const remote = normalizePath(remotePath);
    const token = getAccessToken();
    const md5List = [];
    let size = 0;

    const handle = await fs.open(localPath, "r");

    try {
        const stats = await handle.stat();

        size = stats.size;

        let offset = 0;

        while (offset < size) {
            const length = Math.min(UPLOAD_PART_SIZE, size - offset);
            const buffer = await readPart(handle, length, offset, localPath);

            md5List.push(createHash("md5").update(buffer).digest("hex"));

            offset += length;
        }
    } finally {
        await handle.close();
    }

    if (size === 0) {
        const data = await request("/file", {
            method: "POST",
            query: { method: "create" },
            body: {
                path: remote,
                size: 0,
                isdir: 0,
                block_list: "[]",
                rtype: 3
            },
            timeout: UPLOAD_TIMEOUT,
            api: "method=create"
        });

        return {
            fsId: data.fs_id ?? 0,
            path: data.path ?? remote,
            size: 0,
            md5: data.md5 ?? null
        };
    }

    const precreate = await request("/file", {
        method: "POST",
        query: { method: "precreate" },
        body: {
            path: remote,
            size,
            isdir: 0,
            autoinit: 1,
            block_list: JSON.stringify(md5List),
            rtype: 3
        },
        timeout: UPLOAD_TIMEOUT,
        api: "method=precreate"
    });

    const uploadid = precreate.uploadid ?? null;
    const returnType = Number(precreate.return_type);

    if (returnType !== 2 && !uploadid) {
        throw new BaiduError("百度预上传未返回 uploadid", {
            requestId: precreate.request_id ?? null,
            api: "method=precreate",
            details: { path: remote }
        });
    }

    if (returnType !== 2) {
        await uploadParts(localPath, remote, uploadid, md5List, size, token);
    }

    const data = await request("/file", {
        method: "POST",
        query: { method: "create" },
        body: {
            path: remote,
            size,
            isdir: 0,
            uploadid,
            block_list: JSON.stringify(md5List),
            rtype: 3
        },
        timeout: UPLOAD_TIMEOUT,
        api: "method=create"
    });

    return {
        fsId: data.fs_id ?? 0,
        path: data.path ?? remote,
        size,
        md5: data.md5 ?? null
    };
}

export async function getQuota() {
    try {
        const data = await request("/nas", {
            query: { method: "uinfo" },
            api: "method=uinfo"
        });
        const quota = Number(data.quota ?? 0);
        const used = Number(data.used ?? 0);

        return {
            quota: Number.isFinite(quota) ? quota : 0,
            used: Number.isFinite(used) ? used : 0
        };
    } catch {
        return null;
    }
}
