import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    chmodSync,
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
const productName = pkg.productName || pkg.name;
const releaseRoot = join(root, "release");

function parseTarget(argv) {
    let target = null;

    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--target") {
            target = argv[i + 1];
            i++;
        } else if (argv[i].startsWith("--target=")) {
            target = argv[i].slice("--target=".length);
        }
    }

    if (target !== "linux" && target !== "macos") {
        throw new Error("用法: node scripts/package-posix.mjs --target linux|macos");
    }

    return target;
}

function runNpm(args, cwd) {
    execFileSync("npm", args, { cwd, stdio: "inherit" });
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

function verifyNodeAbi(binary) {
    const abi = execFileSync(binary, ["-p", "process.versions.modules"], {
        encoding: "utf8"
    }).trim();
    const expected = process.versions.modules;

    if (abi !== expected) {
        throw new Error(`Node ABI 不匹配: ${binary} 为 ${abi}，当前构建需要 ${expected}`);
    }
}

async function verifyChecksum({ mirror, version, fileName, archive }) {
    let text;

    try {
        const response = await fetch(`${mirror}/${version}/SHASUMS256.txt`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        text = await response.text();
    } catch (error) {
        console.warn(`无法获取 SHASUMS256.txt，跳过校验: ${error.message}`);
        return;
    }

    const line = text.split(/\r?\n/).find((entry) => {
        const parts = entry.trim().split(/\s+/);
        return parts.length >= 2 && parts[1].replace(/^\*/, "") === fileName;
    });

    if (!line) {
        console.warn(`SHASUMS256.txt 中未找到 ${fileName}，跳过校验`);
        return;
    }

    const expected = line.trim().split(/\s+/)[0].toLowerCase();
    const actual = createHash("sha256").update(readFileSync(archive)).digest("hex");

    if (actual !== expected) {
        throw new Error(`Node 压缩包校验失败: ${fileName}`);
    }

    console.log(`Node 压缩包校验通过: ${fileName}`);
}

async function ensureNodeBinary({ version, arch, target, cacheDir }) {
    const envBin = process.env.NODE_BIN;

    if (envBin) {
        const binary = resolve(envBin);

        if (!existsSync(binary)) {
            throw new Error(`NODE_BIN 不存在: ${binary}`);
        }

        verifyNodeAbi(binary);
        return binary;
    }

    const platformName = target === "macos" ? "darwin" : "linux";
    const dirName = `node-${version}-${platformName}-${arch}`;
    const fileName = `${dirName}.tar.gz`;
    const mirror = (process.env.NODE_MIRROR || "https://nodejs.org/dist").replace(/\/+$/, "");
    const archive = join(cacheDir, fileName);
    const binary = join(cacheDir, dirName, "bin", "node");

    if (existsSync(binary)) {
        verifyNodeAbi(binary);
        return binary;
    }

    mkdirSync(cacheDir, { recursive: true });

    if (existsSync(archive)) {
        try {
            await verifyChecksum({ mirror, version, fileName, archive });
        } catch (error) {
            console.warn(`${error.message}，重新下载`);
            rmSync(archive, { force: true });
        }
    }

    if (!existsSync(archive)) {
        const url = `${mirror}/${version}/${fileName}`;
        console.log(`下载 Node ${version} (${platformName}-${arch})...`);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`下载 Node 失败: ${response.status} ${url}`);
        }

        writeFileSync(archive, Buffer.from(await response.arrayBuffer()));

        try {
            await verifyChecksum({ mirror, version, fileName, archive });
        } catch (error) {
            rmSync(archive, { force: true });
            throw error;
        }
    }

    const extractDir = join(cacheDir, dirName);
    rmSync(extractDir, { recursive: true, force: true });
    execFileSync("tar", ["-xzf", archive, "-C", cacheDir], { stdio: "inherit" });

    if (!existsSync(binary)) {
        throw new Error(`未找到 Node 二进制: ${binary}`);
    }

    verifyNodeAbi(binary);
    return binary;
}

async function main() {
    const target = parseTarget(process.argv.slice(2));
    const expectedPlatform = target === "linux" ? "linux" : "darwin";

    if (process.platform !== expectedPlatform) {
        throw new Error(
            `打包 ${target} 需要在 ${expectedPlatform} 上运行。` +
                "Linux 包可在 Linux 或 Docker 中构建，macOS 包必须在 Mac 上构建。"
        );
    }

    const arch = process.arch;
    const folderName = `${productName}-${pkg.version}-${target}-${arch}`;
    const outDir = join(releaseRoot, folderName);
    const archivePath = join(releaseRoot, `${folderName}.tar.gz`);
    const launcherSource =
        target === "linux" ? join(root, "scripts", "start-linux.sh") : join(root, "scripts", "start-macos.command");
    const launcherName = target === "linux" ? "start.sh" : "start.command";

    console.log("1/7 安装依赖并构建...");
    runNpm(["ci", "--no-audit", "--no-fund"], root);
    runNpm(["run", "build"], root);

    console.log("2/7 准备输出目录...");
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    copyDirectory(join(root, "build"), join(outDir, "build"));
    copyFileSync(join(root, "package.json"), join(outDir, "package.json"));
    copyFileSync(join(root, "package-lock.json"), join(outDir, "package-lock.json"));
    copyFileSync(join(root, ".env.example"), join(outDir, ".env"));
    copyFileSync(join(root, ".env.example"), join(outDir, ".env.example"));
    copyFileSync(join(root, "scripts", "README-portable.txt"), join(outDir, "README.txt"));
    mkdirSync(join(outDir, "data"), { recursive: true });

    console.log("3/7 安装生产依赖...");
    runNpm(["ci", "--omit=dev", "--no-audit", "--no-fund"], outDir);

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

    console.log("4/7 复制启动脚本...");
    copyFileSync(launcherSource, join(outDir, launcherName));
    chmodSync(join(outDir, launcherName), 0o755);

    console.log("5/7 准备 Node 运行时...");
    const nodeBinary = await ensureNodeBinary({
        version: process.version,
        arch,
        target,
        cacheDir: join(root, ".cache", "node")
    });
    copyFileSync(nodeBinary, join(outDir, "node"));
    chmodSync(join(outDir, "node"), 0o755);

    console.log("6/7 生成 tar.gz...");
    rmSync(archivePath, { force: true });
    execFileSync("tar", ["-czf", archivePath, folderName], {
        cwd: releaseRoot,
        stdio: "inherit",
        env: { ...process.env, COPYFILE_DISABLE: "1" }
    });

    console.log("7/7 完成");
    console.log("");
    console.log(`目录：${outDir}（${formatSize(directorySize(outDir))}）`);
    console.log(`压缩包：${archivePath}（${formatSize(statSync(archivePath).size)}）`);
}

main().catch((error) => {
    console.error(`打包失败: ${error.message}`);
    process.exit(1);
});
