import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arch = process.argv[2] === "arm64" ? "arm64" : "x64";
const platform = `linux/${arch === "arm64" ? "arm64" : "amd64"}`;
const destination = resolve(root, "release", `linux-${arch}`);
const outputDestination = destination.replace(/\\/g, "/");

try {
    execFileSync("docker", ["buildx", "version"], { stdio: "ignore" });
} catch {
    console.error("未找到可用的 docker buildx，请安装 Docker Desktop 后重试。");
    process.exit(1);
}

mkdirSync(dirname(destination), { recursive: true });
rmSync(destination, { recursive: true, force: true });

console.log(`导出 Linux 便携包: ${platform} -> ${destination}`);

execFileSync(
    "docker",
    [
        "buildx",
        "build",
        "--platform",
        platform,
        "--target",
        "export",
        "--output",
        `type=local,dest=${outputDestination}`,
        "."
    ],
    { stdio: "inherit", cwd: root }
);

console.log(`完成: ${destination}`);
