#!/usr/bin/env bash
# Finalize covers -> build -> publish -> verify for 2026-10-07. Never prints secrets.
set -euo pipefail
cd /workspace/alioxis-news
python3 scripts/finalize-covers-20261007.py | tail -3
node build.js | tail -5
rg -c 'cover-20261007-' dist/index.html || { echo "dist missing 10-07 covers"; exit 1; }
set -a; source .local/deploy.env; set +a
bash scripts/publish-to-cvm.sh 2>&1 | tail -8
for u in "https://ainews.alioxis.com/" "https://ainews.alioxis.com/?tab=v"; do
  curl -s -o /tmp/pub.html -w "%{http_code} $u\n" "$u"
  rg -o 'Mistral Large 4|企业中台|EmbeddingGemma 2' /tmp/pub.html | sort | uniq -c
done
for f in cover-20261007-ai-00.jpg cover-20261007-ai-19.jpg cover-20261007-v-00.jpg cover-20261007-v-15.jpg; do
  curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}B $f\n" "https://ainews.alioxis.com/assets/covers/$f"
done
