#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo "未找到 .env，无法启动。" >&2
    exit 1
fi

mkdir -p data

PORT_VALUE="$(sed -n 's/^[[:space:]]*PORT=//p' .env | tail -n 1 | tr -d '[:space:]')"
PORT_VALUE="${PORT_VALUE:-3000}"

echo "管理端: http://localhost:${PORT_VALUE}/admin"
echo "按 Ctrl+C 停止服务。"

exec ./node --env-file=.env build
