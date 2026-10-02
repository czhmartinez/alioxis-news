#!/bin/bash
# Sync built static site to Tencent CVM /opt/ainews (served by sunstone-gateway).
# Secrets and host stay OUTSIDE this repo. Required:
#   export AINEWS_CVM_REMOTE=root@x.x.x.x
#   export AINEWS_CVM_SECRET=/path/to/tencent-cvm.json   # {"ssh_password":"..."}
# Or export SSHPASS and use SSH keys / sshpass.
# Optional: AINEWS_CVM_DIR (default /opt/ainews)
# Local tip: source a gitignored .local/deploy.env before running.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
REMOTE="${AINEWS_CVM_REMOTE:-}"
REMOTE_DIR="${AINEWS_CVM_DIR:-/opt/ainews}"
SECRET="${AINEWS_CVM_SECRET:-}"

if [[ ! -d "$DIST" ]]; then
  echo "missing dist: $DIST" >&2
  exit 1
fi
if [[ -z "$REMOTE" ]]; then
  echo "Set AINEWS_CVM_REMOTE (e.g. root@x.x.x.x). See script header." >&2
  exit 1
fi

if [[ -z "${SSHPASS:-}" && -n "$SECRET" && -f "$SECRET" ]]; then
  SSHPASS=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['ssh_password'])" "$SECRET")
  export SSHPASS
fi

if command -v sshpass >/dev/null 2>&1 && [[ -n "${SSHPASS:-}" ]]; then
  SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
else
  SSH=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
fi

"${SSH[@]}" "$REMOTE" "mkdir -p '${REMOTE_DIR}' && rm -rf '${REMOTE_DIR}/dist.next' && mkdir -p '${REMOTE_DIR}/dist.next'"
tar -C "$ROOT" -czf - dist | "${SSH[@]}" "$REMOTE" "tar -C '${REMOTE_DIR}/dist.next' --strip-components=1 -xzf - && rm -rf '${REMOTE_DIR}/dist.prev' && if [[ -d '${REMOTE_DIR}/dist' ]]; then mv '${REMOTE_DIR}/dist' '${REMOTE_DIR}/dist.prev'; fi && mv '${REMOTE_DIR}/dist.next' '${REMOTE_DIR}/dist' && find '${REMOTE_DIR}/dist' -type f | wc -l"
echo "published to $REMOTE:$REMOTE_DIR/dist"
