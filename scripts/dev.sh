#!/usr/bin/env bash
#
# Start the two apps on the host in watch mode.
#
# Always-on mode and hot-reload mode both want ports 3000 and 3001, so
# running this while the api and web containers are up produced a bare
# EADDRINUSE from Next with nothing pointing at the container that
# actually held the port. This script makes the handover explicit:
# it stops those two containers, leaves the infrastructure running so
# the database survives the switch, and only then starts the dev
# servers.
#
#   pnpm dev            hand over from containers, then watch mode
#   pnpm dev --force    also kill host processes squatting on the ports
#
# Going the other way, `pnpm stack:up` refuses to start while a host
# dev server holds a port, rather than racing it.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

FORCE=false
for arg in "$@"; do
  case "$arg" in
    --force | -f) FORCE=true ;;
    *)
      echo "usage: pnpm dev [--force]" >&2
      exit 1
      ;;
  esac
done

API_PORT="${API_PORT:-3000}"
WEB_PORT="${WEB_PORT:-3001}"

# ── 1. hand over from the containers ─────────────────────────────────

if docker info &>/dev/null; then
  running="$(docker compose ps --status running --services 2>/dev/null || true)"

  to_stop=""
  for svc in api web; do
    grep -qx "$svc" <<<"$running" && to_stop="$to_stop $svc"
  done

  if [[ -n "$to_stop" ]]; then
    echo "stopping container(s) to free the ports:$to_stop"
    # shellcheck disable=SC2086
    docker compose stop $to_stop >/dev/null
  fi

  # The database, queue, and audit store stay up. Stopping them here
  # would throw away the running state for no reason: the host dev
  # servers talk to the same containers on the same remapped ports.
  echo "ensuring postgres, redis, and mongo are up..."
  docker compose up -d --wait postgres redis mongo >/dev/null
else
  echo "warning: docker is not responding; skipping the container handover" >&2
fi

# ── 2. clear anything else on the ports ──────────────────────────────

# Container port forwards are held by OrbStack itself, so by this point
# a listener on these ports is a stray host process, usually a dev
# server orphaned when a previous run was interrupted.
blocked=false
for port in "$API_PORT" "$WEB_PORT"; do
  pids="$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  [[ -z "$pids" ]] && continue

  for pid in $pids; do
    cmd="$(ps -o command= -p "$pid" 2>/dev/null | head -1 | cut -c1-70)"
    if $FORCE; then
      echo "killing pid $pid on port $port ($cmd)"
      kill "$pid" 2>/dev/null || true
    else
      echo "port $port is held by pid $pid: $cmd" >&2
      blocked=true
    fi
  done
done

if $FORCE; then
  sleep 2
fi

if $blocked; then
  cat >&2 <<EOF

Those are host processes, not containers. Re-run with --force to kill
them, or stop them yourself:

  pnpm dev --force
EOF
  exit 1
fi

# ── 3. run ───────────────────────────────────────────────────────────

echo
echo "API  http://localhost:${API_PORT}"
echo "web  http://localhost:${WEB_PORT}"
echo

# Turbo's TUI gives each app its own pane; see turbo.json. It needs a
# terminal on both stdin and stdout, and quietly degrades to prefixed
# line-streaming without one, so check both rather than just stdout: CI
# and `pnpm dev | tee` should take the plain path deliberately.
#
# Called directly rather than through `pnpm exec` to keep one less
# process between turbo and the terminal it is trying to drive.
if [[ -t 0 && -t 1 ]] && [[ -x node_modules/.bin/turbo ]]; then
  exec node_modules/.bin/turbo run dev dev:postgres dev:redis dev:mongo
else
  exec pnpm --parallel --filter api --filter web dev
fi
