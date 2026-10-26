# 部署与运维

本文档面向自行部署 BaiduDiskMCP 的用户；快速上手请看 [README](../README.md)。

## 环境变量

复制示例配置：

```bash
cp .env.example .env
```

主要配置：

| 变量 | 说明 |
|---|---|
| `PORT` | 服务端口，默认 `3000` |
| `HOST` | 监听地址，`0.0.0.0` 允许局域网访问 |
| `BODY_SIZE_LIMIT` | 请求体上限，必须大于管理端的上传上限 |
| `DB_PATH` | SQLite 路径，默认 `./data/app.db` |
| `APP_BASE_URL` | 对外访问地址，用于生成上传/下载短链 |
| `BAIDU_ACCESS_TOKEN` | 首次启动时写入数据库，之后以管理端设置为准 |
| `BAIDU_AUTHORIZE_URL` | 可选，百度授权页链接 |

修改 `PORT` 后要同步修改 `APP_BASE_URL`，或登录管理端在设置页更新短链地址。

## 构建与启动

```bash
npm run build
npm start
```

`npm start` 实际执行 `node --env-file=.env build`。建议使用 pm2、systemd 或容器守护进程，并持久化 `data/` 目录。

## Docker

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f
```

停止与重建：

```bash
docker compose down
docker compose up -d --build
```

说明：

- `./data` 绑定到容器 `/app/data`，数据库和临时文件保存在宿主机。
- Linux 下首次启动前确保目录可写：`mkdir -p data && sudo chown -R 1000:1000 data`。
- 如果 Docker Desktop 下 SQLite 出现 WAL 锁或性能问题，按 `docker-compose.yml` 注释改用命名卷。
- 局域网或域名访问时，把 `APP_BASE_URL` 改为成员实际可访问的地址。
- `BODY_SIZE_LIMIT` 默认 `3G`，必须大于管理端上传上限。

## 反向代理

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

- `client_max_body_size` 不小于上传上限，并与 `.env` 中的 `BODY_SIZE_LIMIT` 保持一致。
- 调大 `proxy_read_timeout`、`proxy_send_timeout`，避免大文件传输被代理断开。
- 关闭 `proxy_request_buffering`，让上传流式转发。
- 保留 `Authorization`、`Range` 等请求头。
- `APP_BASE_URL` 改为反向代理后的实际地址。
- 跨网络使用时建议启用 HTTPS。

## 错误码

| code | HTTP | 含义 | 常见原因 |
|---|---|---|---|
| `UNAUTHORIZED` | 401 | 缺少或无效 Key | Key 不完整、成员被禁用 |
| `FORBIDDEN` | 403 | 权限不足 | 没有对应目录与等级的授权 |
| `NOT_FOUND` | 404 | 路径或资源不存在 | 路径错误、短链不存在 |
| `INVALID_ARGUMENT` | 400 | 参数不合法 | 路径、文件名或参数不合法 |
| `CONFLICT` | 409 | 资源冲突 | 上传短链已被使用 |
| `UPLOAD_EXPIRED` | 410 | 短链已过期 | 重新生成短链 |
| `BAIDU_ERROR` | 502 | 百度接口失败 | token 过期、频率限制 |
| `INTERNAL_ERROR` | 500 | 服务内部错误 | 查看服务端日志 |

## 常见问题

**401：无法连接 MCP**

检查 Key 是否完整、格式是否为 `Authorization: Bearer mcp_...`，确认成员未被禁用。重置 Key 后旧 Key 立即失效。

**403：操作被拒绝**

确认成员对目标路径有对应等级的授权。复制需要源 `view` + 目标 `edit`，移动需要两端 `edit`，删除需要 `manage`。下载短链在权限撤销后也会返回 403。

**404：路径不存在**

路径必须以 `/` 开头，且区分大小写。先用 `list_files` 确认目录或文件真实存在。

**502：百度接口失败**

百度 `access_token` 通常约 30 天有效，过期后需在管理端更新。同时检查是否触发百度接口频率限制。

**413：请求体过大**

依次检查 `.env` 中的 `BODY_SIZE_LIMIT`、反向代理的 `client_max_body_size`，以及设置中的上传上限，三者都要覆盖实际文件大小。

**上传卡住或中途断开**

检查反向代理的 `proxy_read_timeout`、`proxy_send_timeout` 是否过小，`proxy_request_buffering` 是否已关闭；确认 `data/tmp` 可写且磁盘空间充足。

**中文文件名乱码**

multipart 上传由 busboy 以 UTF-8 解析文件名；raw 方式需对 `?name=` 做 URL 编码。MCP 的 JSON 参数直接使用中文即可。

**MCP 客户端返回 405**

服务为无状态 Streamable HTTP，只接受 `POST`，`GET` / `DELETE` 返回 405。请使用支持该模式的客户端，或先用 `mcp-remote` 验证连通性。

## 数据与备份

- `data/app.db`：SQLite 数据库，包含设置、成员、API Key、授权、短链、管理员密码哈希和会话记录，必须备份。
- `data/tmp`：上传临时文件目录，可随时清空，不需要备份。

备份时建议先停止服务，或使用 SQLite 在线备份命令，避免复制到不一致的数据库文件。服务使用 WAL 模式，运行中直接复制时还需一并处理 `app.db-wal`、`app.db-shm`。

## 限制说明

- 管理端使用单管理员密码；忘记密码只能手动清除 `admin_auth` 和 `admin_sessions` 后重新初始化。
- 百度 `access_token` 与成员 API Key 以明文存储在 SQLite 中，界面仅做视觉遮罩。
- 百度 `access_token` 过期后需要手动更新。
- 搜索为百度全盘搜索后在本地按权限过滤，最多返回 100 条；`list_files` 单页最多 1000 条。
- 上传短链只能成功使用一次；下载短链 10 分钟有效。
- MCP 上传必须通过短链 + curl；没有 shell 环境的客户端无法上传。
- 不做操作审计，不支持多百度账号、分享、回收站与版本管理。
