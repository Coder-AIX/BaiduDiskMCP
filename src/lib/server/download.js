import { getDownloadLink } from "./baidu.js";
import { AppError, ERROR_CODES } from "./result.js";

// WHAT: 百度下载地址强制要求的 User-Agent
const USER_AGENT = "pan.baidu.com";
// WHAT: 需要从上游原样透传的响应头
const PASSTHROUGH_HEADERS = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges"
];
// WHAT: 允许透传的上游状态码
const ALLOWED_STATUS = new Set([200, 206, 416]);

export async function createDownloadResponse(path, request) {
    const { url, name } = await getDownloadLink(path);
    const headers = {
        "user-agent": USER_AGENT
    };

    for (const key of ["range", "if-range"]) {
        const value = request?.headers?.get?.(key);

        if (value) {
            headers[key] = value;
        }
    }

    let upstream;

    try {
        upstream = await fetch(url, {
            headers,
            redirect: "follow"
        });
    } catch (error) {
        throw new AppError(
            ERROR_CODES.BAIDU_ERROR,
            "百度下载请求失败",
            502,
            {
                path,
                reason: error?.message ?? String(error)
            }
        );
    }

    if (!ALLOWED_STATUS.has(upstream.status)) {
        throw new AppError(
            ERROR_CODES.BAIDU_ERROR,
            `百度下载失败（HTTP ${upstream.status}）`,
            502,
            { path, status: upstream.status }
        );
    }

    const responseHeaders = {};

    for (const key of PASSTHROUGH_HEADERS) {
        const value = upstream.headers.get(key);

        if (value !== null) {
            responseHeaders[key] = value;
        }
    }

    responseHeaders["content-disposition"] =
        `attachment; filename*=UTF-8''${encodeURIComponent(name ?? "")}`;

    return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders
    });
}
