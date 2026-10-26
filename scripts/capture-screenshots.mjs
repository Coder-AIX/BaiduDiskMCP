import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.SCREENSHOT_PORT || 3000);
const baseUrl = `http://127.0.0.1:${port}`;
const dataDir = path.join(root, "data", "screenshots-run");
const screenshotsDir = path.join(root, "docs", "screenshots");
const buildEntry = path.join(root, "build", "index.js");
const password = "demo-password-123";

if (!fs.existsSync(buildEntry)) {
    console.error("未找到 build/index.js，请先执行 npm run build。");
    process.exit(1);
}

fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(screenshotsDir, { recursive: true });

const serverLogs = [];
const server = spawn(process.execPath, ["build"], {
    cwd: root,
    env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        BODY_SIZE_LIMIT: "3G",
        DB_PATH: path.join(dataDir, "app.db"),
        APP_BASE_URL: `http://localhost:${port}`,
        BAIDU_ACCESS_TOKEN: "demo-token-for-screenshots"
    },
    stdio: ["ignore", "pipe", "pipe"]
});

server.stdout.on("data", (chunk) => serverLogs.push(String(chunk)));
server.stderr.on("data", (chunk) => serverLogs.push(String(chunk)));

let browser;
let context;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
        if (server.exitCode !== null) {
            throw new Error(
                `服务启动失败，退出码 ${server.exitCode}\n${serverLogs.join("")}`
            );
        }

        try {
            const response = await fetch(`${baseUrl}/admin/setup`, {
                redirect: "manual"
            });

            if (response.status < 500) {
                return;
            }
        } catch {
            // WHY: 服务尚未监听端口，继续等待
        }

        await sleep(250);
    }

    throw new Error(`等待服务启动超时\n${serverLogs.join("")}`);
}

async function api(pathname, options = {}) {
    const response = await context.request.fetch(`${baseUrl}${pathname}`, {
        ...options,
        headers: {
            "content-type": "application/json",
            ...(options.headers ?? {})
        }
    });
    const body = await response.json();

    if (!response.ok() || body.ok === false) {
        throw new Error(
            `请求 ${pathname} 失败: ${JSON.stringify(body)}`
        );
    }

    return body.data;
}

async function createDemoData() {
    await api("/api/admin/auth/setup", {
        method: "POST",
        data: { password, confirm: password }
    });

    await api("/api/admin/settings", {
        method: "PUT",
        data: {
            baidu_access_token: "demo-token-for-screenshots",
            baidu_app_name: "BaiduDiskMCP",
            baidu_authorize_url:
                "https://openapi.baidu.com/oauth/2.0/authorize?response_type=token&client_id=demo&redirect_uri=oob&scope=basic,netdisk",
            app_base_url: `http://localhost:${port}`,
            upload_link_ttl_sec: 900,
            max_upload_size: 2147483648
        }
    });

    const xiaolin = await api("/api/admin/users", {
        method: "POST",
        data: { name: "小林" }
    });
    const azhe = await api("/api/admin/users", {
        method: "POST",
        data: { name: "阿哲" }
    });
    const mia = await api("/api/admin/users", {
        method: "POST",
        data: { name: "Mia" }
    });
    const guest = await api("/api/admin/users", {
        method: "POST",
        data: { name: "临时访客" }
    });

    await api(`/api/admin/users/${xiaolin.id}/grants`, {
        method: "POST",
        data: { path: "/工作室/设计素材", level: "manage" }
    });
    await api(`/api/admin/users/${xiaolin.id}/grants`, {
        method: "POST",
        data: { path: "/工作室/公开资料", level: "view" }
    });
    await api(`/api/admin/users/${azhe.id}/grants`, {
        method: "POST",
        data: { path: "/工作室/视频素材", level: "edit" }
    });
    await api(`/api/admin/users/${mia.id}/grants`, {
        method: "POST",
        data: { path: "/工作室/公开资料", level: "view" }
    });
    await api(`/api/admin/users/${guest.id}`, {
        method: "PATCH",
        data: { enabled: false }
    });

    return { xiaolin };
}

function installMocks() {
    const nowSec = Math.floor(Date.now() / 1000);

    context.route("**/api/admin/settings/test", async (route) => {
        await route.fulfill({
            json: {
                ok: true,
                data: { connected: true, sampleCount: 8 }
            }
        });
    });

    context.route("**/api/admin/fs/list**", async (route) => {
        await route.fulfill({
            json: {
                ok: true,
                data: {
                    dir: "/",
                    hasMore: false,
                    entries: [
                        {
                            fsId: 101,
                            name: "工作室",
                            path: "/工作室",
                            isDir: true,
                            size: 0,
                            mtime: nowSec - 3600,
                            md5: null
                        },
                        {
                            fsId: 102,
                            name: "品牌素材",
                            path: "/品牌素材",
                            isDir: true,
                            size: 0,
                            mtime: nowSec - 86400,
                            md5: null
                        },
                        {
                            fsId: 103,
                            name: "2026 归档",
                            path: "/2026 归档",
                            isDir: true,
                            size: 0,
                            mtime: nowSec - 3 * 86400,
                            md5: null
                        },
                        {
                            fsId: 201,
                            name: "品牌手册.pdf",
                            path: "/品牌手册.pdf",
                            isDir: false,
                            size: 18245222,
                            mtime: nowSec - 7200,
                            md5: null
                        },
                        {
                            fsId: 202,
                            name: "项目排期.xlsx",
                            path: "/项目排期.xlsx",
                            isDir: false,
                            size: 286720,
                            mtime: nowSec - 10800,
                            md5: null
                        },
                        {
                            fsId: 203,
                            name: "首页视觉稿.png",
                            path: "/首页视觉稿.png",
                            isDir: false,
                            size: 8734512,
                            mtime: nowSec - 90000,
                            md5: null
                        },
                        {
                            fsId: 204,
                            name: "需求说明.docx",
                            path: "/需求说明.docx",
                            isDir: false,
                            size: 1048576,
                            mtime: nowSec - 3 * 86400 - 7200,
                            md5: null
                        }
                    ]
                }
            }
        });
    });

    context.route("**/api/admin/upload-links**", async (route) => {
        const now = Date.now();

        await route.fulfill({
            json: {
                ok: true,
                data: [
                    {
                        id: 1,
                        tokenPrefix: "mcp_demo",
                        targetDir: "/工作室/设计素材",
                        fileName: "品牌提案.zip",
                        expiresAt: new Date(now + 12 * 60 * 1000).toISOString(),
                        usedAt: null,
                        createdAt: new Date(now - 2 * 60 * 1000).toISOString(),
                        status: "active"
                    },
                    {
                        id: 2,
                        tokenPrefix: "mcp_demo",
                        targetDir: "/工作室/设计素材",
                        fileName: "首页视觉稿.png",
                        expiresAt: new Date(now - 3 * 60 * 1000).toISOString(),
                        usedAt: new Date(now - 4 * 60 * 1000).toISOString(),
                        createdAt: new Date(now - 20 * 60 * 1000).toISOString(),
                        status: "used"
                    },
                    {
                        id: 3,
                        tokenPrefix: "mcp_demo",
                        targetDir: "/工作室/公开资料",
                        fileName: "对外介绍.pdf",
                        expiresAt: new Date(now - 30 * 60 * 1000).toISOString(),
                        usedAt: null,
                        createdAt: new Date(now - 45 * 60 * 1000).toISOString(),
                        status: "expired"
                    }
                ]
            }
        });
    });
}

async function capture(page, name, waitForText) {
    if (waitForText) {
        await page.getByText(waitForText, { exact: false }).first().waitFor({
            state: "visible",
            timeout: 15000
        });
    }

    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await sleep(400);
    await page.screenshot({
        path: path.join(screenshotsDir, `${name}.png`),
        animations: "disabled"
    });
    console.log(`已生成 docs/screenshots/${name}.png`);
}

async function main() {
    console.log(`启动临时服务 ${baseUrl}...`);
    await waitForServer();

    browser = await chromium.launch({ channel: "chrome", headless: true });
    context = await browser.newContext({
        baseURL: baseUrl,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: "light",
        locale: "zh-CN"
    });

    installMocks();

    const { xiaolin } = await createDemoData();
    const page = await context.newPage();

    await page.goto("/admin", { waitUntil: "networkidle" });
    await capture(page, "overview", "已连接");

    await page.goto("/admin/files", { waitUntil: "networkidle" });
    await capture(page, "files", "品牌手册.pdf");

    await page.goto("/admin/users", { waitUntil: "networkidle" });
    await capture(page, "users", "小林");

    await page.goto(`/admin/users/${xiaolin.id}`, {
        waitUntil: "networkidle"
    });
    await capture(page, "user-detail", "上传短链");

    await page.goto("/admin/settings", { waitUntil: "networkidle" });
    await capture(page, "settings", "已配置");
}

main()
    .then(() => {
        console.log("截图完成。");
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (browser) {
            await browser.close().catch(() => {});
        }

        server.kill();

        await sleep(500);
        fs.rmSync(dataDir, { recursive: true, force: true });
    });
