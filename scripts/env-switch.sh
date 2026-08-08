#!/usr/bin/env bash
#
# Swap apps/api/.env between the local-container profile and the hosted
# profile (Neon, Upstash, and Atlas).
#
#   pnpm env:local    point the API at the OrbStack containers
#   pnpm env:cloud    point the API at the hosted services
#   pnpm env:which    print which profile is active, secrets redacted
#
# The profiles live in .env.local and .env.cloud; .env is a copy of
# whichever is active. Editing .env directly is fine, but the edit
# belongs in the profile file too or the next switch drops it, so this
# script refuses to clobber an .env that matches neither profile until
# you have a backup.

set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/apps/api"
ACTIVE="$API_DIR/.env"
LOCAL="$API_DIR/.env.local"
CLOUD="$API_DIR/.env.cloud"

redact() {
  sed -E 's#(://[^:/@]+:)[^@]+@#\1****@#g; s#^([A-Z_]*(SECRET|KEY|TOKEN|PASSWORD))=.*#\1=****#g' "$1"
}

# Print the active profile by comparing bytes against each profile file.
which_profile() {
  if [[ ! -f "$ACTIVE" ]]; then
    echo "none"
  elif [[ -f "$LOCAL" ]] && cmp -s "$ACTIVE" "$LOCAL"; then
    echo "local"
  elif [[ -f "$CLOUD" ]] && cmp -s "$ACTIVE" "$CLOUD"; then
    echo "cloud"
  else
    echo "custom"
  fi
}

switch_to() {
  local target_name="$1" target_file="$2"

  if [[ ! -f "$target_file" ]]; then
    echo "error: no $target_name profile at $target_file" >&2
    if [[ "$target_name" == "local" ]]; then
      echo "       run ./setup.sh (or pnpm setup) to generate it" >&2
    else
      echo "       create it from your hosted credentials, or copy .env.example" >&2
    fi
    exit 1
  fi

  local current
  current="$(which_profile)"

  if [[ "$current" == "$target_name" ]]; then
    echo "already on the $target_name profile"
    return 0
  fi

  # An .env matching neither profile holds edits that exist nowhere
  # else. Keep a copy rather than silently discarding it.
  if [[ "$current" == "custom" ]]; then
    cp "$ACTIVE" "$ACTIVE.bak"
    echo "warning: .env matched neither profile; saved it to apps/api/.env.bak"
  fi

  cp "$target_file" "$ACTIVE"
  echo "switched to the $target_name profile"
  echo
  redact "$ACTIVE" | grep -E '^(DATABASE_URL|REDIS_URL|MONGODB_URI)=' || true
  echo
  echo "restart the API for this to take effect."
}

case "${1:-which}" in
  local) switch_to local "$LOCAL" ;;
  cloud) switch_to cloud "$CLOUD" ;;
  which)
    profile="$(which_profile)"
    echo "active profile: $profile"
    case "$profile" in
      none) echo "no apps/api/.env yet; run ./setup.sh" ;;
      custom) echo "(.env matches neither .env.local nor .env.cloud)" ;;
    esac
    if [[ -f "$ACTIVE" ]]; then
      echo
      redact "$ACTIVE" | grep -E '^(DATABASE_URL|REDIS_URL|MONGODB_URI)=' || true
    fi
    ;;
  *)
    echo "usage: $(basename "$0") [local|cloud|which]" >&2
    exit 1
    ;;
esac
