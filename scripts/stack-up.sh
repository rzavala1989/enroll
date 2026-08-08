#!/usr/bin/env bash
#
# Build and start every service as a container, the always-on mode.
#
# The check below is the mirror of scripts/dev.sh: a host dev server
# holding 3000 or 3001 would otherwise make the container's port bind
# fail, and OrbStack's forwarder can end up sharing the port instead of
# refusing it, which leaves two servers answering the same URL and one
# of them silently winning. Better to stop and say so.
#
#   pnpm stack:up            build and start everything
#   pnpm stack:up --force    kill host processes holding the ports first

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

FORCE=false
for arg in "$@"; do
  case "$arg" in
    --force | -f) FORCE=true ;;
    *)
      echo "usage: pnpm stack:up [--force]" >&2
      exit 1
      ;;
  esac
done

API_PORT="${API_PORT:-3000}"
WEB_PORT="${WEB_PORT:-3001}"

if [[ ! -f apps/api/.env.container ]]; then
  echo "error: apps/api/.env.container is missing; run ./setup.sh first" >&2
  exit 1
fi

blocked=false
for port in "$API_PORT" "$WEB_PORT"; do
  for pid in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    # OrbStack's own forwarder means the container already has it; that
    # is this script's own doing on a re-run, not a conflict.
    cmd="$(ps -o command= -p "$pid" 2>/dev/null | head -1)"
    [[ "$cmd" == *OrbStack* || "$cmd" == *com.docker* ]] && continue

    if $FORCE; then
      echo "killing pid $pid on port $port (${cmd:0:70})"
      kill "$pid" 2>/dev/null || true
    else
      echo "port $port is held by a host process, pid $pid: ${cmd:0:70}" >&2
      blocked=true
    fi
  done
done

if $blocked; then
  cat >&2 <<EOF

Stop the host dev servers before starting the always-on stack, or
re-run as:

  pnpm stack:up --force
EOF
  exit 1
fi

$FORCE && sleep 2

exec docker compose up -d --build --wait
