import { execFileSync } from "node:child_process";
import {
    copyFileSync,
    existsSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const releaseRoot = join(root, "release");
const outDir = join(releaseRoot, `${pkg.name}-${pkg.version}-win-x64`);
const zipPath = join(releaseRoot, `${pkg.name}-${pkg.version}-win-x64.zip`);

function run(command, args, options = {}) {
    execFileSync(command, args, { stdio: "inherit", ...options });
}

function npm(args, cwd) {
    run(process.platform === "win32" ? "npm.cmd" : "npm", args, {
        cwd,
        shell: process.platform === "win32"
    });
}

function findCsc() {
    const windir = process.env.WINDIR || "C:\\Windows";
    const candidates = [
        join(windir, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
        join(windir, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe")
    ];

    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error("未找到 .NET Framework 4.x 的 csc.exe，无法编译启动器");
}

function installProductionDependencies(target) {
    try {
        npm(["ci", "--omit=dev", "--no-audit", "--no-fund"], target);
    } catch {
        console.warn("npm ci 失败，回退为复制现有 node_modules 并裁剪开发依赖...");
        rmSync(join(target, "node_modules"), { recursive: true, force: true });
        copyDirectory(join(root, "node_modules"), join(target, "node_modules"));

        try {
            npm(["prune", "--omit=dev", "--no-audit", "--no-fund", "--offline"], target);
        } catch (error) {
            console.warn(`npm prune 失败，保留完整 node_modules：${error.message}`);
        }
    }
}

function copyDirectory(source, destination) {
    mkdirSync(destination, { recursive: true });

    for (const entry of readdirSync(source, { withFileTypes: true })) {
        const from = join(source, entry.name);
        const to = join(destination, entry.name);
        const stat = lstatSync(from);

        if (stat.isDirectory()) {
            copyDirectory(from, to);
        } else if (stat.isSymbolicLink() && statSync(from).isDirectory()) {
            copyDirectory(from, to);
        } else {
            copyFileSync(from, to);
        }
    }
}

function formatSize(bytes) {
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function directorySize(dir) {
    let total = 0;

    let entries;

    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return 0;
    }

    for (const entry of entries) {
        const full = join(dir, entry.name);

        if (entry.isDirectory()) {
            total += directorySize(full);
        } else if (entry.isFile()) {
            total += statSync(full).size;
        }
    }

    return total;
}

console.log("1/6 构建 SvelteKit 产物...");
npm(["run", "build"], root);

console.log("2/6 准备输出目录...");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

copyDirectory(join(root, "build"), join(outDir, "build"));
copyFileSync(join(root, "package.json"), join(outDir, "package.json"));
copyFileSync(join(root, "package-lock.json"), join(outDir, "package-lock.json"));

console.log("3/6 安装生产依赖...");
installProductionDependencies(outDir);

const nativeModule = join(
    outDir,
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node"
);

if (!existsSync(nativeModule)) {
    throw new Error("未找到 better-sqlite3 原生模块，便携包无法运行");
}

console.log("4/6 复制 Node 运行时并生成配置...");
const nodeExe = process.env.NODE_EXE || process.execPath;
copyFileSync(nodeExe, join(outDir, "node.exe"));
copyFileSync(join(root, ".env.example"), join(outDir, ".env"));
mkdirSync(join(outDir, "data"), { recursive: true });

const readme = `\uFEFFstudio-drive 便携版
====================

1. 双击 studio-drive.exe 启动服务。
2. 启动后会自动打开 http://localhost:3000/admin（端口以 .env 为准）。
3. 首次访问按页面提示设置管理员密码，然后配置百度网盘 access_token。
4. 不需要自动打开浏览器时，可执行：studio-drive.exe --no-browser
5. 退出时关闭控制台窗口，或按 Ctrl+C。

端口配置
--------
编辑 .env：
  PORT=3000
  APP_BASE_URL=http://localhost:3000

修改端口后，必须同时修改 APP_BASE_URL（或登录管理端在设置页更新短链地址），
否则上传/下载短链仍会指向旧地址。

数据与备份
----------
- 数据库、临时文件都在 data 目录。
- 备份时先停止服务，再复制整个 data 目录。
- 需要迁移旧配置时，把旧环境的 data/app.db（以及 app.db-wal、app.db-shm）
  复制到本目录的 data 下。

系统要求
--------
- Windows x64。
- 启动器依赖 .NET Framework 4.x，Windows 10/11 已自带。
- 首次运行如出现防火墙提示，需要放行才能让局域网成员访问。
- 启动器未签名，可能触发 SmartScreen，选择“更多信息 -> 仍要运行”即可。
`;

writeFileSync(join(outDir, "README.txt"), readme, "utf8");

console.log("5/6 编译启动器...");
const csc = findCsc();
run(
    csc,
    [
        "/nologo",
        "/target:exe",
        "/optimize+",
        "/codepage:65001",
        "/out:studio-drive.exe",
        join(root, "scripts", "launcher.cs")
    ],
    { cwd: outDir }
);

console.log("6/6 生成 zip...");
const escapedOutDir = outDir.replace(/'/g, "''");
const escapedZipPath = zipPath.replace(/'/g, "''");
const compressCommand = `Compress-Archive -LiteralPath '${escapedOutDir}' -DestinationPath '${escapedZipPath}' -Force`;

try {
    run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", compressCommand]);
} catch {
    console.warn(`zip 生成失败，可直接使用目录：${outDir}`);
}

const dirBytes = directorySize(outDir);
console.log("");
console.log(`完成：${outDir}（${formatSize(dirBytes)}）`);

if (existsSync(zipPath)) {
    console.log(`压缩包：${zipPath}（${formatSize(statSync(zipPath).size)}）`);
}
