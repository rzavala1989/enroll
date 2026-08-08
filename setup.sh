#!/usr/bin/env bash
#
# One command to go from a fresh clone to a running stack against local
# containers. Safe to re-run: every step is idempotent, and the only
# file it will overwrite without asking is apps/api/.env, which it
# treats as a copy of a profile rather than as the source of truth.
#
#   ./setup.sh              set up against local containers
#   ./setup.sh --no-seed    skip the seed step
#   ./setup.sh --reset      delete the container volumes first
#
# What it does NOT do: touch the hosted services. Your Neon, Upstash,
# and Atlas credentials stay in apps/api/.env.cloud, and `pnpm env:cloud`
# switches back to them.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

NO_SEED=false
RESET=false
for arg in "$@"; do
  case "$arg" in
    --no-seed) NO_SEED=true ;;
    --reset) RESET=true ;;
    -h | --help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown flag: $arg" >&2
      exit 1
      ;;
  esac
done

POSTGRES_PORT="${POSTGRES_PORT:-5442}"
REDIS_PORT="${REDIS_PORT:-6389}"
MONGO_PORT="${MONGO_PORT:-27027}"
export POSTGRES_PORT REDIS_PORT MONGO_PORT

# ── output helpers (styled with gum when present, plain otherwise) ────

has_gum() { command -v gum &>/dev/null; }
step() { has_gum && gum style --foreground 212 --bold "$1" || echo "==> $1"; }
ok() { has_gum && gum style --foreground 46 "  $1" || echo "  ok: $1"; }
info() { has_gum && gum style --foreground 220 "  $1" || echo "  $1"; }
fail() {
  has_gum && gum style --foreground 196 --bold "  $1" || echo "  error: $1" >&2
}
confirm() {
  if has_gum; then
    gum confirm "$1"
  else
    read -r -p "$1 (y/n): " -n 1 reply
    echo
    [[ $reply =~ ^[Yy]$ ]]
  fi
}

die() {
  fail "$1"
  exit 1
}

# ── 1. prerequisites ─────────────────────────────────────────────────

step "1/8  Checking prerequisites"

command -v docker &>/dev/null || die "docker not found. Install OrbStack: brew install orbstack"
docker compose version &>/dev/null || die "docker compose v2 not found. OrbStack ships it; check your docker CLI."

# OrbStack (and Docker Desktop) can be installed but not running.
if ! docker info &>/dev/null; then
  info "Docker engine is not responding; trying to start OrbStack..."
  if command -v orb &>/dev/null; then
    orb start &>/dev/null || true
    for _ in $(seq 1 30); do
      docker info &>/dev/null && break
      sleep 1
    done
  fi
  docker info &>/dev/null || die "Docker engine still unreachable. Start OrbStack and re-run."
fi
ok "docker engine: $(docker info --format '{{.ServerVersion}} ({{.Name}})' 2>/dev/null)"

command -v pnpm &>/dev/null || die "pnpm not found. Install it: corepack enable && corepack prepare pnpm@10.33.2 --activate"
ok "pnpm $(pnpm --version)"

for pair in "postgres:$POSTGRES_PORT" "redis:$REDIS_PORT" "mongo:$MONGO_PORT"; do
  svc="${pair%%:*}"
  port="${pair##*:}"
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN &>/dev/null; then
    owner="$(docker ps --filter "publish=$port" --format '{{.Names}}' 2>/dev/null || true)"
    if [[ "$owner" == "enroll-$svc" ]]; then
      continue # our own container from a previous run
    fi
    die "port $port ($svc) is in use by something else. Re-run with ${svc^^}_PORT=<free port>."
  fi
done
ok "host ports free: $POSTGRES_PORT, $REDIS_PORT, $MONGO_PORT"

# ── 2. dependencies ──────────────────────────────────────────────────

step "2/8  Installing dependencies"
pnpm install --frozen-lockfile 2>&1 | tail -3
ok "dependencies installed"

# ── 3. shared package ────────────────────────────────────────────────


step "3/8  Building @enroll/shared"
pnpm build:shared >/dev/null
ok "packages/shared/dist built"

# ── 4. containers ────────────────────────────────────────────────────

step "4/8  Starting containers"
if $RESET; then
  info "--reset given: removing volumes"
  docker compose down -v --remove-orphans &>/dev/null || true
fi

docker compose up -d postgres redis mongo
ok "postgres, redis, and mongo started"

# ── 5. health ────────────────────────────────────────────────────────

step "5/8  Waiting for health checks"
for svc in postgres redis mongo; do
  cid="$(docker compose ps -q "$svc")"
  [[ -n "$cid" ]] || die "container for $svc did not start. See: docker compose logs $svc"
  for i in $(seq 1 60); do
    status="$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo starting)"
    [[ "$status" == "healthy" ]] && break
    if [[ "$i" == 60 ]]; then
      die "$svc never became healthy (last status: $status). See: docker compose logs $svc"
    fi
    sleep 1
  done
  ok "$svc healthy"
done

# ── 6. env profile ───────────────────────────────────────────────────

step "6/8  Writing the local env profile"

API_ENV="apps/api/.env"
LOCAL_ENV="apps/api/.env.local"


if [[ -f "$API_ENV" && ! -f "apps/api/.env.cloud" ]] && ! grep -q 'localhost' "$API_ENV"; then
  cp "$API_ENV" "apps/api/.env.cloud"
  info "saved your existing .env to apps/api/.env.cloud"
fi

if [[ -f "$LOCAL_ENV" ]]; then
  ok ".env.local already exists, keeping it"
else
  # Reuse the cloud JWT secret if there is one so tokens minted before
  # the switch still verify; otherwise generate a fresh one.
  jwt_secret="$(
    grep -h '^JWT_ACCESS_SECRET=' apps/api/.env.cloud 2>/dev/null |
      head -1 | cut -d= -f2- | tr -d '"' || true
  )"
  if [[ ${#jwt_secret} -lt 32 ]]; then
    jwt_secret="$(openssl rand -hex 32)"
  fi

  cat >"$LOCAL_ENV" <<EOF
# Local-container profile. Generated by setup.sh; safe to edit and
# safe to delete (setup.sh rewrites it). Ports match docker-compose.yml,
# which stays off 5432/6379/27017 to avoid a Homebrew postgres or redis.
#
# Switch profiles with: pnpm env:local / pnpm env:cloud

NODE_ENV="development"
PORT=3000

DATABASE_URL="postgresql://enroll:enroll@localhost:${POSTGRES_PORT}/enroll"
REDIS_URL="redis://localhost:${REDIS_PORT}"
MONGODB_URI="mongodb://localhost:${MONGO_PORT}"
MONGODB_DB="enroll_audit"

JWT_ACCESS_SECRET="${jwt_secret}"
JWT_ACCESS_EXPIRY="30m"
JWT_REFRESH_EXPIRY="7d"

CORS_ORIGINS="http://localhost:3001"
TRUST_PROXY_HOPS=0
SCHEDULERS_ENABLED=true
CATALOG_CACHE_TTL_MS=15000
LOG_LEVEL="info"
EOF
  ok "wrote apps/api/.env.local"
fi

cp "$LOCAL_ENV" "$API_ENV"
ok "activated the local profile"

{
  cat <<'EOF'
# Compose-network profile. GENERATED by setup.sh from .env.local on
# every run; edit .env.local instead, or this file is overwritten.
#
# Read by the api and migrate services in docker-compose.yml. Never
# copied over .env: on the host these hostnames do not resolve.

EOF
  sed -E \
    -e "s#@localhost:${POSTGRES_PORT}/#@postgres:5432/#" \
    -e "s#redis://localhost:${REDIS_PORT}#redis://redis:6379#" \
    -e "s#mongodb://localhost:${MONGO_PORT}#mongodb://mongo:27017#" \
    -e 's#^([A-Za-z_][A-Za-z0-9_]*)="(.*)"[[:space:]]*$#\1=\2#' \
    "$LOCAL_ENV" | sed -E '1,/^$/{/^(#|$)/d;}'
} >"apps/api/.env.container"
ok "derived apps/api/.env.container for the compose network"

# ── 7. schema ────────────────────────────────────────────────────────

step "7/8  Applying migrations"
pnpm --filter api exec prisma generate >/dev/null
pnpm --filter api exec prisma migrate deploy 2>&1 | grep -Ev '^$' | tail -5
ok "schema up to date"

# ── 8. seed ──────────────────────────────────────────────────────────

step "8/8  Seeding"
if $NO_SEED; then
  info "--no-seed given, skipping"
else
  pnpm --filter api exec prisma db seed 2>&1 | tail -3
  ok "seeded: 152 courses, ~304 sections, 57 users (password: 'password')"
fi

# ── done ─────────────────────────────────────────────────────────────

echo
step "Setup complete"
cat <<EOF

  postgres  localhost:${POSTGRES_PORT}   redis  localhost:${REDIS_PORT}   mongo  localhost:${MONGO_PORT}

  Two ways to run the apps. Both want ports 3000 and 3001, and each
  hands over from the other, so you can switch without cleaning up.

  Always-on, survives reboot:
    pnpm stack:up       build and run api and web as containers too
    pnpm stack:rebuild  after a code change
    pnpm stack:logs     tail api and web
    pnpm stack:down     stop everything

  Actively coding, hot reload:
    pnpm dev            stops the api and web containers, then watch
                        mode on the host. Add --force to kill any
                        stray dev server holding a port.

  pnpm health       check every dependency is reachable
  pnpm env:cloud    point the API back at Neon, Upstash, and Atlas
  pnpm env:which    show which profile is active

EOF

if [[ -t 0 ]] && confirm "Start the dev servers now?"; then
  exec pnpm dev
fi
