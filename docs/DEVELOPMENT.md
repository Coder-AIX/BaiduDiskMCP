# 开发、打包与发布

## 技术栈

- Node.js 22
- SvelteKit（`@sveltejs/adapter-node`）与 Svelte 5
- SQLite（`better-sqlite3`）
- MCP（`@modelcontextprotocol/sdk`），Streamable HTTP，无状态模式
- `zod` 参数校验，`busboy` 流式解析上传

## 本地开发

```bash
npm install
cp .env.example .env
npm run dev
```

开发端与管理端使用同一端口，默认 `http://localhost:3000/admin`。首次启动会创建 `data/app.db`，并清空 `data/tmp`。

生产构建：

```bash
npm run build
npm start
```

## 目录说明

```text
src/
    routes/          页面与 API / MCP 端点
    lib/server/      百度网盘、权限、用户、短链、MCP 工具
    lib/components/  管理端组件
scripts/             打包、启动器与截图脚本
docs/                部署、开发与截图
```

## 版本与命名

- 展示名称：`BaiduDiskMCP`
- npm 包名：`baidudiskmcp`
- `package.json` 中的 `productName` 用于生成发布包和可执行文件名称
- MCP Server 名称与版本需要与 `package.json` 保持一致

发布前同步修改：

1. `package.json` 的 `version`
2. `src/lib/server/mcp/server.js` 的 `version`
3. 创建对应 tag，例如 `v1.0.0`

## 截图

功能截图使用 Playwright 和本机 Chrome 生成：

```bash
npm run build
npm run screenshots
```

脚本会：

- 使用临时数据库启动服务
- 创建虚构成员、目录授权和演示数据
- Mock 百度目录列表与连接测试
- 输出到 `docs/screenshots/`

不会使用真实百度 token、API Key 或网盘文件。

## 打包

| 目标 | 构建环境 | 命令 | 产物 |
|---|---|---|---|
| Windows x64 | Windows | `npm run package:win` | `BaiduDiskMCP-1.0.0-win-x64.zip` |
| Linux x64 | Linux | `npm run package:linux` | `BaiduDiskMCP-1.0.0-linux-x64.tar.gz` |
| Linux arm64 | Linux arm64 | `npm run package:linux` | `BaiduDiskMCP-1.0.0-linux-arm64.tar.gz` |
| macOS arm64 | Apple Silicon Mac | `npm run package:macos` | `BaiduDiskMCP-1.0.0-macos-arm64.tar.gz` |
| macOS x64 | Intel Mac | `npm run package:macos` | `BaiduDiskMCP-1.0.0-macos-x64.tar.gz` |

`better-sqlite3` 是原生模块，不能跨平台复用，因此每个平台需要在该平台或对应 CI Runner 上构建。

没有 Linux 主机时，可以使用 Docker 导出：

```bash
npm run package:linux:docker
npm run package:linux:docker:arm64
```

macOS 包必须在 Mac 上构建。打包脚本会自动下载与当前 Node 版本、架构匹配的官方 Node；无法访问 `nodejs.org` 时可设置 `NODE_MIRROR`。

## GitHub Actions 发布

`.github/workflows/release.yml` 会在以下情况运行：

- 推送 `v*` tag
- 在 Actions 页面手动触发

构建矩阵：

- `windows-latest` → Windows x64
- `ubuntu-latest` → Linux x64
- `ubuntu-24.04-arm` → Linux arm64
- `macos-15` → macOS arm64
- `macos-15-intel` → macOS x64

工作流会汇总产物、生成 `SHA256SUMS.txt`，并创建 GitHub Release。

如果 `ubuntu-24.04-arm` 或 `macos-15-intel` 在当前账号不可用，可分别回退到 Docker buildx 和 `macos-13`。

## 发布流程

```bash
git add .
git commit -m "release: BaiduDiskMCP 1.0.0"
git push origin main
git tag v1.0.0
git push origin v1.0.0
```

推送 tag 后等待 Actions 完成，检查 Release 中的全部产物。

## 许可

本项目采用个人免费、禁止商用的授权方式，详见 [README](../README.md#许可协议)。
