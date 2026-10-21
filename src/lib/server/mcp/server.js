import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";

// WHAT: 提供给 MCP 客户端的服务说明，帮助模型在调用工具前理解路径、权限与上传下载策略
const INSTRUCTIONS = `这是内部工作室网盘，用于团队共享文件。

路径规则：
- 所有路径都以 / 开头，例如 / 表示根目录，/工作室/项目 表示子目录。
- 只能访问当前 API Key 被授权的目录范围。

权限等级：
- view：可查看、搜索、查询详情和下载。
- edit：在 view 基础上可上传、新建文件夹、重命名、复制和移动。
- manage：在 edit 基础上可删除文件或目录。

使用建议：
- 不确定有哪些可用目录时，先调用 whoami 查看授权列表。
- 上传统一使用 create_upload_link，并执行返回的 curl 命令；短链默认 15 分钟内有效且只能成功使用一次，没有 shell 环境将无法上传。
- 下载使用 get_download_link，返回的地址 10 分钟内有效。`;

export function createMcpServer(user) {
    const server = new McpServer(
        {
            name: "studio-drive",
            version: "0.1.0"
        },
        {
            instructions: INSTRUCTIONS
        }
    );

    registerTools(server, user);

    return server;
}
