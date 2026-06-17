#!/usr/bin/env sh
# QNAP Container Station 部署脚本
# 建议把整个 nio 项目放到：
#   /share/Container/nio-dashboard/
# 或
#   /share/homes/<用户名>/nio-dashboard/

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/deploy"

echo "=========================================="
echo " 蔚来看板 · QNAP Container Station 部署"
echo "=========================================="
echo ""
echo "项目目录: $ROOT"
echo ""

if [ ! -f "$DEPLOY/.env" ]; then
  echo "[1/4] 缺少 deploy/.env"
  echo ""
  echo "请先从 Postman 导出 Collection："
  echo "  Postman → 你的 Request 所在 Collection → ... → Export → Collection v2.1"
  echo "  保存到例如: $ROOT/postman/nio.json"
  echo ""
  echo "然后运行："
  echo "  cd $ROOT"
  echo "  npm run postman:env -- ./postman/nio.json"
  echo ""
  echo "或手动复制："
  echo "  cp $DEPLOY/.env.example $DEPLOY/.env"
  echo "  编辑填入 Postman 的 URL 和 Headers"
  exit 1
fi

echo "[1/4] 检查 Node.js"
if ! command -v node >/dev/null 2>&1; then
  echo "QNAP 上需要 Node.js（App Center 安装 Node.js 或在 PC 上 build 后上传 dist）"
  echo "方案 A: 在 Mac 上 npm run build，只上传 dist + deploy 到 NAS"
  echo "方案 B: App Center 安装 Node.js 后重新运行本脚本"
  exit 1
fi

echo "[2/4] 构建前端"
cd "$ROOT"
npm ci
npm run build

echo "[3/4] 初始化数据"
mkdir -p "$DEPLOY/data"
if [ ! -f "$DEPLOY/data/vehicle.json" ] && [ -f "$ROOT/data/vehicle.json" ]; then
  cp "$ROOT/data/vehicle.json" "$DEPLOY/data/vehicle.json"
fi
if [ -f "$ROOT/data/change.json" ]; then
  cp "$ROOT/data/change.json" "$DEPLOY/data/change.json"
fi

echo "[4/4] 启动 Docker Compose"
if ! command -v docker >/dev/null 2>&1; then
  echo "请先安装 Container Station，并启用「容器」功能"
  exit 1
fi

cd "$DEPLOY"
docker compose up -d --build

PORT="$(grep '^WEB_PORT=' .env 2>/dev/null | cut -d= -f2 || echo 8088)"
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo '<QNAP_IP>')"

echo ""
echo "=========================================="
echo " 部署完成"
echo "=========================================="
echo "看板: http://${LAN_IP}:${PORT}"
echo "日志: docker logs -f nio-fetcher"
echo "手动拉取: docker exec nio-fetcher npm run fetch"
echo ""
echo "Container Station 图形界面："
echo "  容器 → nio-fetcher / nio-dashboard 应显示 Running"
echo "  若端口冲突，修改 deploy/.env 的 WEB_PORT 后 docker compose up -d"
