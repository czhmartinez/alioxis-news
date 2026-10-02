#!/bin/bash
# Local preview HTTP only. Public site is on CVM /opt/ainews via sunstone-gateway.
set -u
LOG=/tmp/alioxis-keep.log
HTTP_DIR=/workspace/alioxis-news/dist
HTTP_PORT=8080
HTTP_PID_FILE=/tmp/alioxis-http.pid

log(){ echo "$(date -Is) $*" >> "$LOG"; }

ensure_http(){
  if curl -fsS -m 2 "http://127.0.0.1:${HTTP_PORT}/" >/dev/null 2>&1; then
    return 0
  fi
  log "local http down, restarting (preview only)"
  if [[ -f $HTTP_PID_FILE ]]; then
    kill "$(cat "$HTTP_PID_FILE")" 2>/dev/null || true
  fi
  nohup python3 -m http.server "$HTTP_PORT" --bind 0.0.0.0 --directory "$HTTP_DIR" \
    >/tmp/alioxis-http.log 2>&1 &
  echo $! > "$HTTP_PID_FILE"
}

log "watchdog start (local preview only; public = CVM)"
while true; do
  ensure_http
  sleep 30
done
