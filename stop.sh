#!/usr/bin/env bash
set -e
source "$(dirname "${BASH_SOURCE[0]}")/scripts/local-env.sh"

# Astro resolves its process records relative to this project's root.
echo "正在停止当前博客的开发和预览服务…"
BLOG_STOP_FAILED=0
node "$BLOG_ASTRO_BIN" dev stop || BLOG_STOP_FAILED=1
node "$BLOG_ASTRO_BIN" preview stop || BLOG_STOP_FAILED=1
exit "$BLOG_STOP_FAILED"
