#!/bin/bash
# 本地阅读器：常驻启动。DOCS_ROOT 指到 知识库/，根目录就是三个知识库。
B="/Users/quchengzang/Desktop/DeepSeek 笔试题"
lsof -ti:8090 2>/dev/null | xargs -r kill -9 2>/dev/null
sleep 1
cd "$B/reader" || exit 1
export DOCS_ROOT="$B/知识库"
export VITE_SITE_ICON_FILE="$B/reader/public/favicon.svg"
exec npm run dev
