import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticate } from "../../lib/server/auth.js";
import { createMcpServer } from "../../lib/server/mcp/server.js";
import { AppError, ERROR_CODES, jsonError } from "../../lib/server/result.js";

export const prerender = false;

// WHAT: 允许跨域 MCP 客户端直接访问该端点，并放行 MCP 会话与协议相关请求头
const CORS_HEADERS = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers":
        "Authorization, Content-Type, X-API-Key, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
    "access-control-expose-headers": "Mcp-Session-Id, MCP-Protocol-Version"
};

// WHAT: 复制响应头并合并 CORS 头，避免直接修改原始 Response 的不可变响应头
function withCors(response) {
    const headers = new Headers(response.headers);

    for (const [name, value] of Object.entries(CORS_HEADERS)) {
        headers.set(name, value);
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

function corsJsonError(code, message, status = 400, extraHeaders = {}) {
    const response = jsonError(code, message, status);
    const headers = new Headers(response.headers);

    for (const [name, value] of Object.entries(extraHeaders)) {
        headers.set(name, value);
    }

    return withCors(
        new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers
        })
    );
}

export async function POST({ request }) {
    try {
        let user;

        try {
            user = authenticate(request);
        } catch (error) {
            if (error instanceof AppError) {
                return corsJsonError(
                    error.code,
                    error.message,
                    401,
                    { "www-authenticate": "Bearer" }
                );
            }

            throw error;
        }

        const server = createMcpServer(user);
        const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
            maxRequestBodySize: 8 * 1024 * 1024
        });

        await server.connect(transport);

        const response = await transport.handleRequest(request);

        return withCors(response);
    } catch (error) {
        console.error(error);

        return corsJsonError(
            ERROR_CODES.INTERNAL_ERROR,
            "服务内部错误",
            500
        );
    }
}

export function GET() {
    return corsJsonError(
        ERROR_CODES.INVALID_ARGUMENT,
        "仅支持 POST",
        405,
        { allow: "POST, OPTIONS" }
    );
}

export function DELETE() {
    return corsJsonError(
        ERROR_CODES.INVALID_ARGUMENT,
        "仅支持 POST",
        405,
        { allow: "POST, OPTIONS" }
    );
}

export function OPTIONS() {
    return withCors(
        new Response(null, {
            status: 204,
            headers: CORS_HEADERS
        })
    );
}
