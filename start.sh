#!/usr/bin/env bash
set -e
source "$(dirname "${BASH_SOURCE[0]}")/scripts/local-env.sh"

echo "正在启动博客开发服务（后台运行，保存代码后自动更新）…"
node "$BLOG_ASTRO_BIN" dev --background --host 127.0.0.1 --port 4321
echo "访问地址以上方 Astro 输出为准，默认 http://127.0.0.1:4321/"
echo "关闭服务：bash \"$BLOG_ROOT/stop.sh\""
