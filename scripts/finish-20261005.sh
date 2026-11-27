#!/usr/bin/env bash
# Finalize covers -> build -> publish -> verify for 2026-10-05. Never prints secrets.
set -euo pipefail
cd /workspace/alioxis-news
python3 scripts/finalize-covers-20261005.py
node build.js
rg -c 'cover-20261005-' dist/index.html || { echo "dist missing 10-05 covers"; exit 1; }
set -a; source .local/deploy.env; set +a
bash scripts/publish-to-cvm.sh 2>&1 | tail -15
for u in "https://ainews.alioxis.com/" "https://ainews.alioxis.com/?tab=v"; do
  curl -s -o /tmp/pub.html -w "%{http_code} $u\n" "$u"
  rg -o '超级智能部队|Codex团队承诺28天|朝鲜称试射导弹' /tmp/pub.html | sort | uniq -c
done
for f in cover-20261005-ai-00.jpg cover-20261005-v-00.jpg cover-20261005-v-16.jpg; do
  curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}B $f\n" "https://ainews.alioxis.com/assets/covers/$f"
done
