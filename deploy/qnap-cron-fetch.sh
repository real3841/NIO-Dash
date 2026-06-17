#!/usr/bin/env sh
# QNAP 计划任务：每小时拉取一次（不依赖 fetcher 常驻）
# 在 QNAP 控制台 → 系统 → 任务计划 → 新增 → 用户定义的脚本 里粘贴调用：
#   /share/Container/nio-dashboard/deploy/qnap-cron-fetch.sh

set -eu
DEPLOY="/share/Container/nio-dashboard/deploy"
cd "$DEPLOY"
/usr/local/bin/docker compose exec -T fetcher npm run fetch 2>/var/log/nio-fetch.log
