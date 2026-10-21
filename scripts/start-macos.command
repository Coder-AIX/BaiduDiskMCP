#!/bin/bash
set -e

cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo "未找到 .env，无法启动。"
    read -n 1 -s -r -p "按任意键退出..."
    exit 1
fi

mkdir -p data

PORT_VALUE="$(sed -n 's/^[[:space:]]*PORT=//p' .env | tail -n 1 | tr -d '[:space:]')"
PORT_VALUE="${PORT_VALUE:-3000}"

echo "管理端: http://localhost:${PORT_VALUE}/admin"
echo "按 Ctrl+C 停止服务。"
echo

exec ./node --env-file=.env build
