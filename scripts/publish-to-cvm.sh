#!/bin/bash
# Sync built static site to Tencent CVM /opt/ainews (served by sunstone-gateway).
# Password is NEVER in this file. Prefer:
#   export AINEWS_CVM_SECRET=/path/to/tencent-cvm.json   # {"ssh_password":"..."}
#   export AINEWS_CVM_REMOTE=root@x.x.x.x
# Or set SSHPASS / use SSH keys. Local box falls back to connector-secrets path (gitignored).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
REMOTE="${AINEWS_CVM_REMOTE:-root@49.233.218.252}"
REMOTE_DIR="${AINEWS_CVM_DIR:-/opt/ainews}"
SECRET="${AINEWS_CVM_SECRET:-}"
BOX_SECRET=/home/box/agent-data/connector-secrets/5ba5f569-10de-440f-ae31-382fe8dcb918/tencent-cvm.json
BOX_SECRET_ALT=/home/box/sand-data/connector-secrets/5ba5f569-10de-440f-ae31-382fe8dcb918/tencent-cvm.json

if [[ ! -d "$DIST" ]]; then
  echo "missing dist: $DIST" >&2
  exit 1
fi

if [[ -z "${SSHPASS:-}" ]]; then
  if [[ -n "$SECRET" && -f "$SECRET" ]]; then
    SSHPASS=$(python3 -c "import json; print(json.load(open('$SECRET'))['ssh_password'])")
    export SSHPASS
  elif [[ -f "$BOX_SECRET" ]]; then
    SSHPASS=$(python3 -c "import json; print(json.load(open('$BOX_SECRET'))['ssh_password'])")
    export SSHPASS
  elif [[ -f "$BOX_SECRET_ALT" ]]; then
    SSHPASS=$(python3 -c "import json; print(json.load(open('$BOX_SECRET_ALT'))['ssh_password'])")
    export SSHPASS
  fi
fi

if command -v sshpass >/dev/null 2>&1 && [[ -n "${SSHPASS:-}" ]]; then
  SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
else
  SSH=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
fi

"${SSH[@]}" "$REMOTE" "mkdir -p '${REMOTE_DIR}' && rm -rf '${REMOTE_DIR}/dist.next' && mkdir -p '${REMOTE_DIR}/dist.next'"
tar -C "$ROOT" -czf - dist | "${SSH[@]}" "$REMOTE" "tar -C '${REMOTE_DIR}/dist.next' --strip-components=1 -xzf - && rm -rf '${REMOTE_DIR}/dist.prev' && if [[ -d '${REMOTE_DIR}/dist' ]]; then mv '${REMOTE_DIR}/dist' '${REMOTE_DIR}/dist.prev'; fi && mv '${REMOTE_DIR}/dist.next' '${REMOTE_DIR}/dist' && find '${REMOTE_DIR}/dist' -type f | wc -l"
echo "published to $REMOTE:$REMOTE_DIR/dist"
