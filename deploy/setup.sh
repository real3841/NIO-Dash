#!/usr/bin/env sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/deploy"

echo "==> 构建前端"
cd "$ROOT"
npm ci
npm run build

echo "==> 初始化数据目录"
mkdir -p "$DEPLOY/data"
if [ ! -f "$DEPLOY/data/vehicle.json" ] && [ -f "$ROOT/data/vehicle.json" ]; then
  cp "$ROOT/data/vehicle.json" "$DEPLOY/data/vehicle.json"
fi

if [ ! -f "$DEPLOY/.env" ]; then
  cp "$DEPLOY/.env.example" "$DEPLOY/.env"
  echo ""
  echo "请先编辑 deploy/.env，填入 Postman 中的 URL 和 Headers"
  echo "  nano $DEPLOY/.env"
  exit 1
fi

echo "==> 启动 Docker（fetcher 每小时拉取 + web 看板）"
cd "$DEPLOY"
docker compose up -d --build

echo ""
echo "看板地址: http://<NAS_IP>:$(grep WEB_PORT .env 2>/dev/null | cut -d= -f2 || echo 8088)"
echo "查看拉取日志: docker logs -f nio-fetcher"
