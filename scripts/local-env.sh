#!/usr/bin/env bash
# Shared setup for the local service scripts; no downloads or installs.
BLOG_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BLOG_ROOT"

BLOG_NODE_VERSION="$(tr -d '[:space:]' < .nvmrc)"
BLOG_NVM_SCRIPT="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
if [ -s "$BLOG_NVM_SCRIPT" ]; then
  # nvm is a shell function and is not normally available in non-interactive scripts.
  source "$BLOG_NVM_SCRIPT" --no-use
  if ! nvm use --silent "$BLOG_NODE_VERSION"; then
    echo "请先安装项目所需的 Node：nvm install $BLOG_NODE_VERSION" >&2
    exit 1
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js，请先安装 .nvmrc 指定的版本：$BLOG_NODE_VERSION" >&2
  exit 1
fi
if [ "$(node --version)" != "v$BLOG_NODE_VERSION" ]; then
  echo "当前 Node 为 $(node --version)，请切换到项目版本 v$BLOG_NODE_VERSION 后重试。" >&2
  exit 1
fi

BLOG_ASTRO_BIN="$BLOG_ROOT/node_modules/astro/bin/astro.mjs"
if [ ! -f "$BLOG_ASTRO_BIN" ]; then
  echo "尚未安装项目依赖，请在 $BLOG_ROOT 中运行 npm ci 后重试。" >&2
  exit 1
fi
