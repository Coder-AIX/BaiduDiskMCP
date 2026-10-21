# studio-drive

基于百度网盘的个人工作室文件访问层。管理端负责配置百度网盘、创建用户并按目录授权；成员通过统一的 MCP HTTP 端点访问文件，所有操作都会在服务端校验目录权限。

## 功能列表

- 管理端配置百度网盘 `access_token`，并可测试连接
- 懒加载浏览百度网盘目录，不做全盘缓存
- 创建用户时自动生成 `mcp_` 开头的 API Key，可随时查看与重置
- 按目录授予 `view` / `edit` / `manage` 三级权限
- 提供单一 MCP Streamable HTTP 端点，无有效 Key 一律拒绝
- 通过 MCP 完成列表、搜索、详情、下载、上传、复制、移动、重命名、删除
- MCP 上传统一使用上传短链 + curl
- 下载通过本服务短链代理，不向成员暴露百度 `access_token`
- 管理端支持目录浏览、上传、下载、新建、重命名、移动、复制、删除及短链管理

## 技术栈

- Node.js 22
- SvelteKit（`@sveltejs/adapter-node`）与 Svelte 5
- SQLite（`better-sqlite3`）
- MCP（`@modelcontextprotocol/sdk`），Streamable HTTP，无状态模式
- `zod` 参数校验，`busboy` 流式解析上传

## 快速开始

### 1. 安装依赖

需要 Node.js 22 或更高版本。

```bash
npm install
```

### 2. 准备环境变量

复制示例配置：

```bash
cp .env.example .env
```

Windows 命令行可使用：

```bat
copy .env.example .env
```

编辑 `.env`，至少填写以下两项：

```dotenv
BAIDU_ACCESS_TOKEN=你的百度网盘 access_token
APP_BASE_URL=http://localhost:3000
```

说明：

- `APP_BASE_URL` 用于生成上传、下载短链，必须是成员实际可访问的地址。部署到局域网或域名后要同步修改。
- `PORT` 默认 `3000`，开发（`npm run dev`）与生产（`npm start`）使用同一端口。
- 修改 `PORT` 后要同步修改 `APP_BASE_URL`，或登录管理端在设置页更新短链地址；否则生成的短链仍指向旧地址。
- `BODY_SIZE_LIMIT` 是请求体上限，必须大于设置中的 `max_upload_size`（默认 2GB），示例值为 `3G`。
- 首次启动时 `BAIDU_ACCESS_TOKEN` 会作为种子写入数据库，之后以管理端设置为准。

### 3. 启动开发服务

```bash
npm run dev
```

### 4. 打开管理端

```text
http://localhost:3000/admin
```

首次启动会自动创建 `data/app.db`，并清空 `data/tmp` 中的临时内容。

首次访问管理端会进入 `/admin/setup` 设置管理员密码；之后访问 `/admin` 需要登录。密码至少 10 个字符。

## 管理端登录

- 首次访问 `/admin` 会跳转到 `/admin/setup`，设置管理员密码后自动登录。
- 之后通过 `/admin/login` 登录；侧栏底部提供“退出登录”。
- 管理端页面和 `/api/admin/*` 需要登录；`/mcp`、`/u`、`/d` 仍按用户 Key 和短链鉴权，不受管理端密码影响。
- 密码使用 `scrypt` 哈希存储，会话 Cookie 为 `HttpOnly`、`SameSite=Lax`，默认 7 天过期。
- 没有“修改密码”和“找回密码”界面。忘记密码时需要删除 `admin_auth` 和 `admin_sessions` 记录后重新进入初始化；请先备份数据库。

## 首次配置

1. 首次访问管理端，设置管理员密码并登录。
2. 进入 `/admin/settings`，填写百度网盘 `access_token` 并保存。
3. 点击“测试连接”，确认能正常访问百度网盘；失败时检查 token 是否过期。
4. 进入 `/admin/users` 新建用户，系统会生成 `mcp_` 开头的 API Key。Key 可在用户详情页查看和复制。
5. 在用户详情页添加目录授权，选择目录与等级（`view` / `edit` / `manage`）。授权路径以管理端目录选择结果为准。
6. 如需让成员从根目录开始浏览，需要显式授予 `/` 的权限。

## 权限模型

等级从低到高为 `view < edit < manage`：

| 等级 | 能力 |
|---|---|
| `view` | 列出目录、搜索、查看详情、下载 |
| `edit` | 在 `view` 基础上上传、新建文件夹、重命名、复制、移动 |
| `manage` | 在 `edit` 基础上删除文件或目录 |

计算规则：

- 路径先标准化：以 `/` 开头、去掉末尾 `/`、合并重复 `/`，并拒绝 `..`
- 在用户的所有授权中，筛选出「授权路径是目标路径本身或祖先」的记录
- 在所有匹配的祖先授权中取最高等级作为有效等级
- 没有任何匹配授权即无权限；`/` 的授权覆盖全盘

操作与所需权限：

| 操作 | 所需权限 |
|---|---|
| 列表、搜索、详情、下载 | 目标路径 `view` |
| 上传、新建文件夹、重命名 | 目标目录或所在目录 `edit` |
| 复制 | 源路径 `view` + 目标目录 `edit` |
| 移动 | 源路径 `edit` + 目标目录 `edit` |
| 删除 | 每条路径 `manage` |

管理端 API 需要管理员登录；MCP 端点与短链接口按用户授权执行上述规则。

## MCP 接入

### 地址与鉴权

```text
http://<host>:3000/mcp
```

请求头：

```text
Authorization: Bearer mcp_xxxxxxxx
```

同时支持以下两种方式，优先级从高到低：

1. `Authorization: Bearer <key>`
2. `X-API-Key: <key>`
3. 查询参数 `?key=<key>`

缺少 Key、Key 无效或用户被禁用时返回 `401`，响应带 `WWW-Authenticate: Bearer`。服务为无状态 Streamable HTTP，仅 `POST` 处理 MCP 请求；`GET`、`DELETE` 返回 `405`，`OPTIONS` 用于 CORS 预检。

### Claude Desktop 配置（mcp-remote）

仅支持 stdio 的客户端可通过 `mcp-remote` 转发：

```json
{
    "mcpServers": {
        "studio-drive": {
            "command": "npx",
            "args": [
                "mcp-remote",
                "http://localhost:3000/mcp",
                "--header",
                "Authorization: Bearer mcp_xxxxxxxx"
            ]
        }
    }
}
```

将 `mcp_xxxxxxxx` 替换为实际 Key，远程部署时把地址改为成员可访问的地址。

### 工具清单

共 11 个工具，统一返回 `{ ok, data }` 或 `{ ok: false, error: { code, message, details } }` 的 JSON 文本。

| 工具 | 用途 | 所需权限 |
|---|---|---|
| `whoami` | 查看当前用户、目录授权与等级说明 | 有效 Key |
| `list_files` | 列出目录内容，默认 `/`，支持 `start` / `limit`，单页最多 1000 条 | `view` |
| `search_files` | 按关键字搜索，结果逐条过滤，最多 100 条 | `view` |
| `stat_file` | 查询文件或目录详情 | `view` |
| `get_download_link` | 生成 10 分钟有效的本服务下载短链 | `view` |
| `create_upload_link` | 生成配合 curl 使用的上传短链（唯一上传方式） | `edit` |
| `copy_file` | 复制文件或目录 | 源 `view` + 目标 `edit` |
| `create_folder` | 新建文件夹 | `edit` |
| `rename_file` | 重命名文件或目录 | 所在目录 `edit` |
| `move_file` | 移动文件或目录 | 源 `edit` + 目标 `edit` |
| `delete_files` | 批量删除，自动去重，最多 50 条 | 每条 `manage` |

建议模型在不确定授权范围时先调用 `whoami`，再进行其他操作。

## 上传：短链 + curl

MCP 不提供 base64 上传或分片上传，上传必须通过 `create_upload_link` 生成短链，再用 `curl`（或其他能向短链发送 POST 的客户端）完成。

流程：

1. 调用 `create_upload_link`，传入 `dir`，可选 `fileName`、`expiresInSec`
2. 工具返回短链、到期时间和现成 curl 命令
3. 执行 curl 上传；短链默认有效期 15 分钟，且只能成功使用一次

multipart 方式（推荐，可自动携带文件名）：

```bash
curl -X POST "http://localhost:3000/u/<token>" \
    -F "file=@D:/tmp/demo.zip"
```

raw 二进制方式（需在查询参数中指定文件名）：

```bash
curl -X POST "http://localhost:3000/u/<token>?name=demo.zip" \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@D:/tmp/demo.zip"
```

说明：

- `D:/tmp/demo.zip` 为 Windows 路径示例，请替换为实际文件路径
- 中文文件名在 raw 方式下需要对 `name` 参数做 URL 编码
- 上传超过 `max_upload_size` 时返回 `413`
- 这是给 shell / curl 使用的地址，不是浏览器上传页面
- 没有 shell 环境的纯 MCP 客户端无法上传
- 短链在 HTTP 层不做断点续传，失败后需重新生成短链并上传

## 百度授权：外部链接

MCP 上传不涉及百度授权；管理端获取百度 `access_token` 有两种方式：

1. 直接粘贴已有的 `access_token`。
2. 在设置页填写一个外部百度授权页链接，保存后点击“打开授权页”或“复制链接”，在外部完成授权，再把拿到的 `access_token` 粘贴回来并保存。

说明：

- 授权链接由你自行提供，可以是百度开放平台的 OAuth 授权页或其他外部工具生成的链接。
- 本服务不接收 OAuth 回调，也不会自动写入 token；token 必须手动粘贴。
- `access_token` 约 30 天有效，过期后重新授权并粘贴。
- 如果把授权链接复制到另一台设备，确保该设备能访问百度授权页；token 仍然手动复制回本页。
- 可选环境变量 `BAIDU_AUTHORIZE_URL` 只作为首次初始化的链接种子，之后以设置页为准。

### 下载

调用 `get_download_link`，传入 `path`，返回：

- `url`：本服务地址 `http://<host>:3000/d/<token>`
- `expiresAt`：到期时间，链接 10 分钟内有效
- `name`、`size`
- `curl`：可直接执行的下载命令

```bash
curl -L -C - "http://localhost:3000/d/<token>" -o demo.zip
```

`/d/<token>` 每次请求都会重新校验用户状态与 `view` 权限，并代理百度下载、转发 `Range` 请求，因此支持断点续传。链接中不包含百度 `access_token`；权限被撤销后链接立即返回 `403`。

## 生产运行

### 构建与启动

```bash
npm run build
npm start
```

`npm start` 实际执行 `node --env-file=.env build`，需要确保 `.env` 与构建产物 `build/` 存在。

建议使用 pm2、systemd 或容器等方式守护进程，并持久化 `data/` 目录。

### Windows 便携包

执行：

```bash
npm run package:win
```

产物位于 `release/`，包含未压缩目录和 zip：

```text
release/studio-drive-0.1.0-win-x64/
    studio-drive.exe    启动器，双击运行
    node.exe            Node 22 运行时
    .env                默认端口 3000，不含密钥
    build/              构建产物
    node_modules/       生产依赖
    data/               运行时数据库与临时文件
    README.txt
```

说明：

- 目标机器为 Windows x64，不需要安装 Node.js。
- 启动器会把工作目录切换到自身所在目录，启动服务并自动打开 `http://localhost:<PORT>/admin`（默认 3000）。
- 不需要自动打开浏览器时可执行 `studio-drive.exe --no-browser`。
- 端口被占用时会直接打开管理端页面；关闭控制台窗口或按 `Ctrl+C` 停止服务。
- 便携包默认使用全新的空数据库。需要保留现有配置时，停止服务后把 `data/app.db`（以及 `data/app.db-wal`、`data/app.db-shm`）复制到便携包的 `data/` 目录。
- 包内的 `.env` 由 `.env.example` 生成，不包含百度 token 等敏感信息。
- 首次运行如遇 Windows 防火墙提示，需要放行才能让局域网成员访问。
- 启动器未签名，可能触发 SmartScreen 提示；选择“更多信息 → 仍要运行”即可。

### Linux / macOS 便携包

Linux：

```bash
npm run package:linux
```

输出 `release/studio-drive-0.1.0-linux-x64.tar.gz`（arm64 机器上为 `linux-arm64`）。

```bash
tar -xzf release/studio-drive-0.1.0-linux-x64.tar.gz
cd studio-drive-0.1.0-linux-x64
./start.sh
```

没有 Linux 主机时，可以用 Docker 导出：

```bash
npm run package:linux:docker
npm run package:linux:docker:arm64
```

产物分别位于 `release/linux-x64/` 和 `release/linux-arm64/`，可自行压缩。

macOS：

```bash
npm run package:macos
```

输出 `release/studio-drive-0.1.0-macos-arm64.tar.gz`（Intel Mac 为 `macos-x64`）。

```bash
tar -xzf release/studio-drive-0.1.0-macos-arm64.tar.gz
cd studio-drive-0.1.0-macos-arm64
双击 start.command
```

说明：

- Linux/macOS 包内置对应平台的 Node 运行时，目标机器不需要安装 Node.js。
- SQLite 原生模块与平台、架构绑定，不能跨平台或跨架构复用。
- Linux 包适用于 glibc 系统（Debian/Ubuntu/CentOS 等），不支持 Alpine。
- macOS 包只能在 Mac 上构建；Apple Silicon 和 Intel 需要分别构建。
- macOS 包未签名，首次打开可能被 Gatekeeper 拦截；右键选择“打开”，或执行 `xattr -dr com.apple.quarantine <目录>`。
- 打包脚本会自动下载与当前 Node 版本、架构匹配的官方 Node；无法访问 `nodejs.org` 时可设置 `NODE_MIRROR`，例如 `NODE_MIRROR=https://npmmirror.com/mirrors/node npm run package:macos`。
- 已有可用的 Node 二进制时，可通过 `NODE_BIN=/path/to/node` 跳过下载，但 ABI 必须与构建时使用的 Node 一致。
- 端口、`APP_BASE_URL`、数据迁移与 Windows 包一致。

### Docker 与 docker-compose

准备环境变量：

```bash
cp .env.example .env
```

按实际访问地址修改 `.env`：

```dotenv
PORT=3000
APP_BASE_URL=http://localhost:3000
```

启动：

```bash
docker compose up -d --build
docker compose logs -f
```

访问 `http://localhost:3000/admin`。

停止与重建：

```bash
docker compose down
docker compose up -d --build
```

说明：

- `./data` 绑定到容器 `/app/data`，数据库和临时文件直接保存在宿主机。
- Linux 下首次启动前确保目录可写：`mkdir -p data && sudo chown -R 1000:1000 data`。
- 如果 Docker Desktop 下 SQLite 出现 WAL 锁或性能问题，按 `docker-compose.yml` 注释改用命名卷。
- 局域网或域名访问时，把 `APP_BASE_URL` 改为成员可访问的地址，并放行对应端口。
- `BODY_SIZE_LIMIT` 默认 `3G`，必须大于管理端的上传上限。
- 反向代理配置与下文 Nginx 示例相同，代理目标改为 `127.0.0.1:3000`。
- 备份时停止容器后复制 `data/`。
- Docker 运行镜像基于 `node:22-bookworm-slim`，不使用 Alpine，避免 SQLite 原生模块兼容问题。

### 构建矩阵

| 目标 | 构建环境 | 命令 | 产物 |
|---|---|---|---|
| Windows x64 | Windows | `npm run package:win` | zip |
| Linux x64 | Linux 或 Docker | `npm run package:linux` / `package:linux:docker` | tar.gz / 目录 |
| Linux arm64 | Linux arm64 或 Docker buildx | `package:linux:docker:arm64` | 目录 |
| macOS arm64 | Apple Silicon Mac | `npm run package:macos` | tar.gz |
| macOS x64 | Intel Mac | `npm run package:macos` | tar.gz |
| Docker 镜像 | 任意 Docker 主机 | `npm run docker:up` | 运行容器 |

注意：`better-sqlite3` 是原生模块，不能在一台机器上直接交叉产出所有平台包。Linux 可借助 Docker buildx，macOS 必须使用 macOS 构建机。

### 反向代理

Nginx 示例：

```nginx
server {
    listen 80;
    server_name drive.example.com;

    client_max_body_size 3g;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_request_buffering off;
    }
}
```

要点：

- `client_max_body_size` 不小于上传上限，并与 `.env` 中的 `BODY_SIZE_LIMIT` 保持一致
- `BODY_SIZE_LIMIT` 必须大于设置中的 `max_upload_size`，否则请求会被提前拒绝
- 调大 `proxy_read_timeout`、`proxy_send_timeout`，避免大文件上传/下载被代理断开
- 关闭 `proxy_request_buffering`，让上传流式转发
- 保留 `Authorization`、`Range` 等请求头
- `APP_BASE_URL` 改为反向代理后的实际地址，否则短链不可用
- 跨网络使用时建议启用 HTTPS，避免 Key 与文件内容明文传输

## 错误码

MCP 工具返回的统一错误码，以及短链接口对应的 HTTP 状态：

| code | HTTP | 含义 | 常见原因 |
|---|---|---|---|
| `UNAUTHORIZED` | 401 | 缺少或无效 Key | Key 不完整、用户被禁用 |
| `FORBIDDEN` | 403 | 权限不足 | 没有对应目录与等级的授权 |
| `NOT_FOUND` | 404 | 路径或资源不存在 | 路径错误、短链不存在 |
| `INVALID_ARGUMENT` | 400 | 参数不合法 | 路径、文件名或参数不合法 |
| `CONFLICT` | 409 | 资源冲突 | 上传短链已被使用 |
| `UPLOAD_EXPIRED` | 410 | 短链已过期 | 重新生成短链 |
| `BAIDU_ERROR` | 502 | 百度接口失败 | token 过期、频率限制 |
| `INTERNAL_ERROR` | 500 | 服务内部错误 | 查看服务端日志 |

## 常见问题

**401：无法连接 MCP**

检查 Key 是否完整、格式是否为 `Authorization: Bearer mcp_...`，确认用户未被禁用。重置 Key 后旧 Key 立即失效。

**403：操作被拒绝**

确认用户对目标路径有对应等级的授权。复制需要源 `view` + 目标 `edit`，移动需要两端 `edit`，删除需要 `manage`。下载短链在权限撤销后也会返回 403。

**404：路径不存在**

路径必须以 `/` 开头，且区分大小写。先用 `list_files` 确认目录或文件真实存在。

**502：百度接口失败**

百度 `access_token` 通常有效期为 30 天，过期后需在管理端更新。同时检查是否触发百度接口频率限制。

**413：请求体过大**

依次检查 `.env` 中的 `BODY_SIZE_LIMIT`、反向代理的 `client_max_body_size`，以及设置中的 `max_upload_size`，三者都要覆盖实际文件大小。

**上传卡住或中途断开**

检查反向代理的 `proxy_read_timeout`、`proxy_send_timeout` 是否过小，`proxy_request_buffering` 是否已关闭；确认 `data/tmp` 可写且磁盘空间充足。

**中文文件名乱码**

multipart 上传由 busboy 以 UTF-8 解析文件名；raw 方式需对 `?name=` 做 URL 编码。MCP 的 JSON 参数直接使用中文即可。

**MCP 客户端返回 405**

服务为无状态 Streamable HTTP，只接受 `POST`，`GET` / `DELETE` 返回 405。请使用支持该模式的客户端，或先用 `mcp-remote` 验证连通性。

**下载返回 403**

百度下载地址会过期，重新调用 `get_download_link` 获取新链接；若权限已撤销，则链接会持续返回 403。

## 数据与备份

- `data/app.db`：SQLite 数据库，包含设置、用户、API Key、授权、短链、管理员密码哈希和会话记录，必须备份
- `data/tmp`：上传临时文件目录，可随时清空，不需要备份

备份时建议先停止服务，或使用 SQLite 在线备份命令，避免复制到不一致的数据库文件。服务使用 WAL 模式，运行中直接复制时还需一并处理 `app.db-wal`、`app.db-shm`。

## 限制说明

- 管理端使用单管理员密码；忘记密码只能手动清除 `admin_auth` 和 `admin_sessions` 后重新初始化
- 百度 `access_token` 与用户 API Key 以明文存储在 SQLite 中，界面仅做视觉遮罩
- 百度 `access_token` 过期后需要手动更新
- 没有自动化测试，功能由用户按手动清单验证
- 搜索为百度全盘搜索后在本地按权限过滤，最多返回 100 条；`list_files` 单页最多 1000 条
- 上传短链只能成功使用一次；下载短链 10 分钟有效
- MCP 上传必须通过短链 + curl；没有 shell 环境的客户端无法上传
- 不做操作审计，不支持多百度账号、分享、回收站与版本管理

## 手动验证

本项目不包含自动化测试。完整的手动验收步骤、权限边界、上传下载与短链检查项，请参考：

```text
.project/tasks/08-联调与文档.md
```

重点覆盖管理端初始化与登录/退出、启动与配置、用户与授权、MCP 基础、权限边界、上传、下载、管理端文件操作、短链管理、重启与清理等场景。
