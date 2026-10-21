import { z } from "zod";
import { env } from "$env/dynamic/private";
import { AppError, ERROR_CODES } from "../result.js";
import {
    listGrants,
    canView,
    requireLevel,
    normalizePath,
    parentPath,
    joinPath,
    baseName,
    validateName
} from "../permissions.js";
import {
    list,
    search,
    statByPath,
    copy,
    createFolder,
    rename,
    move,
    remove
} from "../baidu.js";
import { createUploadLink } from "../upload-links.js";
import { createDownloadLink } from "../download-links.js";
import { getSetting } from "../settings.js";

function getBaseUrl() {
    const configured = getSetting("app_base_url");

    if (typeof configured === "string" && configured.trim() !== "") {
        try {
            const url = new URL(configured.trim());

            if (url.protocol === "http:" || url.protocol === "https:") {
                return configured.trim().replace(/\/+$/, "");
            }
        } catch {
            // WHY: 配置值不是合法绝对地址时回退到本机地址，避免生成不可用短链
        }
    }

    return `http://localhost:${env.PORT || 3000}`;
}

function toolSuccess(data) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ ok: true, data })
            }
        ]
    };
}

function toolError(code, message, details) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    ok: false,
                    error: { code, message, details }
                })
            }
        ],
        isError: true
    };
}

async function runTool(fn) {
    try {
        return toolSuccess(await fn());
    } catch (error) {
        if (error instanceof AppError) {
            return toolError(error.code, error.message, error.details);
        }

        console.error(error);

        return toolError(
            ERROR_CODES.INTERNAL_ERROR,
            "服务内部错误"
        );
    }
}

export function registerTools(server, user) {
    const userId = user.id;

    server.registerTool(
        "whoami",
        {
            description:
                "查看当前 API Key 对应的用户、目录授权与权限等级说明。无需额外权限。",
            inputSchema: {}
        },
        async () =>
            runTool(async () => ({
                id: user.id,
                name: user.name,
                grants: listGrants(userId),
                levels: {
                    view: "可查看、搜索、查询详情和下载",
                    edit: "在 view 基础上可上传、新建文件夹、重命名、复制和移动",
                    manage: "在 edit 基础上可删除文件或目录"
                }
            }))
    );

    server.registerTool(
        "list_files",
        {
            description:
                "列出指定目录下的文件与文件夹，默认根目录 /。需要该目录的 view 权限。",
            inputSchema: {
                dir: z.string().optional(),
                start: z.number().int().min(0).optional(),
                limit: z.number().int().min(1).max(1000).optional()
            }
        },
        async (args) =>
            runTool(async () => {
                const dir = normalizePath(args.dir ?? "/");

                requireLevel(userId, dir, "view");

                const page = await list(
                    dir,
                    args.start ?? 0,
                    args.limit ?? 1000
                );

                return {
                    dir,
                    entries: page.entries,
                    hasMore: page.hasMore
                };
            })
    );

    server.registerTool(
        "search_files",
        {
            description:
                "按关键字搜索文件，仅返回有 view 权限的结果；传 dir 时再做目录前缀过滤。最多返回 100 条。",
            inputSchema: {
                keyword: z.string().min(1),
                dir: z.string().optional()
            }
        },
        async (args) =>
            runTool(async () => {
                let prefix = null;

                if (args.dir !== undefined) {
                    prefix = normalizePath(args.dir);
                    requireLevel(userId, prefix, "view");
                }

                const found = await search(args.keyword);

                const entries = found
                    .filter((entry) => canView(userId, entry.path))
                    .filter((entry) => {
                        if (prefix === null || prefix === "/") {
                            return true;
                        }

                        return (
                            entry.path === prefix ||
                            entry.path.startsWith(`${prefix}/`)
                        );
                    })
                    .slice(0, 100);

                return {
                    keyword: args.keyword,
                    entries
                };
            })
    );

    server.registerTool(
        "stat_file",
        {
            description:
                "查询文件或目录的详细信息。需要目标路径的 view 权限。",
            inputSchema: {
                path: z.string().min(1)
            }
        },
        async (args) =>
            runTool(async () => {
                requireLevel(userId, args.path, "view");

                return statByPath(args.path);
            })
    );

    server.registerTool(
        "get_download_link",
        {
            description:
                "生成 10 分钟有效的本服务下载短链，不暴露百度 token。需要目标路径的 view 权限。",
            inputSchema: {
                path: z.string().min(1)
            }
        },
        async (args) =>
            runTool(async () => {
                requireLevel(userId, args.path, "view");

                const entry = await statByPath(args.path);
                const link = createDownloadLink({
                    userId,
                    path: entry.path
                });
                const url = `${getBaseUrl()}/d/${link.token}`;

                return {
                    url,
                    expiresAt: link.expiresAt,
                    name: entry.name,
                    size: entry.size,
                    curl: `curl -L -C - "${url}" -o "${entry.name}"`
                };
            })
    );

    server.registerTool(
        "create_upload_link",
        {
            description:
                "生成可配合 curl 使用的上传短链，这是 MCP 唯一的上传方式。需要目标目录的 edit 权限。返回的是 shell 命令，不是浏览器页面。",
            inputSchema: {
                dir: z.string(),
                fileName: z.string().optional(),
                expiresInSec: z.number().int().optional()
            }
        },
        async (args) =>
            runTool(async () => {
                requireLevel(userId, args.dir, "edit");

                const link = createUploadLink({
                    userId,
                    dir: args.dir,
                    fileName: args.fileName,
                    ttlSec: args.expiresInSec
                });
                const url = `${getBaseUrl()}/u/${link.token}`;

                return {
                    url,
                    expiresAt: link.expiresAt,
                    targetDir: link.targetDir,
                    fileName: link.fileName,
                    curl: `curl -X POST "${url}" -F "file=@<LOCAL_FILE>"`,
                    usage:
                        "这是给 shell/curl 用的命令，不是浏览器页面；执行前请把 <LOCAL_FILE> 替换为实际本地文件路径。"
                };
            })
    );

    server.registerTool(
        "copy_file",
        {
            description:
                "复制文件或目录到目标目录。需要源路径的 view 权限和目标目录的 edit 权限。",
            inputSchema: {
                src: z.string().min(1),
                destDir: z.string().min(1),
                newName: z.string().optional()
            }
        },
        async (args) =>
            runTool(async () => {
                requireLevel(userId, args.src, "view");
                requireLevel(userId, args.destDir, "edit");

                const name =
                    args.newName !== undefined
                        ? validateName(args.newName)
                        : baseName(args.src);

                const result = await copy(args.src, args.destDir, name);

                return {
                    path: joinPath(args.destDir, name),
                    result
                };
            })
    );

    server.registerTool(
        "create_folder",
        {
            description:
                "在指定目录下新建文件夹。需要该目录的 edit 权限。",
            inputSchema: {
                dir: z.string(),
                name: z.string()
            }
        },
        async (args) =>
            runTool(async () => {
                requireLevel(userId, args.dir, "edit");

                const name = validateName(args.name);
                const target = joinPath(args.dir, name);

                await createFolder(target);

                return { path: target };
            })
    );

    server.registerTool(
        "rename_file",
        {
            description:
                "重命名文件或目录。需要所在目录的 edit 权限。",
            inputSchema: {
                path: z.string().min(1),
                newName: z.string()
            }
        },
        async (args) =>
            runTool(async () => {
                const parent = parentPath(args.path);

                requireLevel(userId, parent, "edit");

                const name = validateName(args.newName);

                await rename(args.path, name);

                return { path: joinPath(parent, name) };
            })
    );

    server.registerTool(
        "move_file",
        {
            description:
                "移动文件或目录到目标目录。需要源路径与目标目录的 edit 权限。",
            inputSchema: {
                src: z.string().min(1),
                destDir: z.string().min(1),
                newName: z.string().optional()
            }
        },
        async (args) =>
            runTool(async () => {
                requireLevel(userId, args.src, "edit");
                requireLevel(userId, args.destDir, "edit");

                const name =
                    args.newName !== undefined
                        ? validateName(args.newName)
                        : baseName(args.src);

                await move(args.src, args.destDir, name);

                return { path: joinPath(args.destDir, name) };
            })
    );

    server.registerTool(
        "delete_files",
        {
            description:
                "批量删除文件或目录（自动去重，最多 50 条）。每条路径都需要 manage 权限。",
            inputSchema: {
                paths: z.array(z.string()).min(1).max(50)
            }
        },
        async (args) =>
            runTool(async () => {
                const paths = [
                    ...new Set(args.paths.map((item) => normalizePath(item)))
                ];

                for (const item of paths) {
                    requireLevel(userId, item, "manage");
                }

                const result = await remove(paths);

                return { paths, result };
            })
    );
}
