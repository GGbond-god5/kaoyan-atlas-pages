#!/bin/bash
# 在 ECS 上安装/更新批改 worker。用法：bash install.sh <worker令牌>
set -e
TOKEN="${1:?用法: bash install.sh <worker令牌>}"
SRC=/opt/atlas-src
if [ -d "$SRC/.git" ]; then git -C "$SRC" pull --ff-only; else git clone --depth 1 https://github.com/GGbond-god5/kaoyan-atlas-pages.git "$SRC"; fi
mkdir -p /opt/atlas-worker
cp "$SRC/worker/atlas-worker.mjs" /opt/atlas-worker/
printf 'ATLAS_SITE=https://kaoyan-atlas-pages.pages.dev\nATLAS_WORKER_TOKEN=%s\n' "$TOKEN" > /opt/atlas-worker/worker.env
chmod 600 /opt/atlas-worker/worker.env
cp "$SRC/worker/atlas-worker.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now atlas-worker
systemctl status atlas-worker --no-pager | head -12
