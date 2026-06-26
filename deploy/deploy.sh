#!/usr/bin/env bash
set -Eeuo pipefail

readonly PROJECT=/projects/interview-botelo
readonly BACKEND_HEALTH_URL="http://127.0.0.1:8000/health"
readonly FRONTEND_HEALTH_URL="http://127.0.0.1:3000"

log() {
  echo "==> $1"
}

print_service_diagnostics() {
  systemctl --no-pager --full status interview-coach interview-frontend || true
}

require_command() {
  local command_name=$1
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "==> required command not found: $command_name" >&2
    exit 1
  fi
}

wait_for_url() {
  local url=$1
  local label=$2
  local attempts=${3:-30}
  local delay=${4:-2}
  local response_file
  response_file=$(mktemp)

  for ((i=1; i<=attempts; i++)); do
    if curl -fsS "$url" >"$response_file"; then
      log "${label} is healthy"
      rm -f "$response_file"
      return 0
    fi

    log "waiting for ${label} (${i}/${attempts})"
    sleep "$delay"
  done

  echo "==> ${label} did not become healthy in time" >&2
  if [[ -s "$response_file" ]]; then
    echo "==> last ${label} response:" >&2
    cat "$response_file" >&2
  fi
  rm -f "$response_file"
  return 1
}

trap print_service_diagnostics ERR

require_command curl
require_command git
require_command npm
require_command systemctl

log "Pull latest code"
cd "$PROJECT"
git pull --ff-only origin main

log "Install backend deps"
/projects/env-deploy/bin/pip install -e backend/ -q

log "Build frontend"
cd "$PROJECT/frontend"
npm ci --silent
npm run build

log "Restart services"
systemctl restart interview-coach
systemctl restart interview-frontend

log "Wait for services to become healthy"
wait_for_url "$BACKEND_HEALTH_URL" "backend"
wait_for_url "$FRONTEND_HEALTH_URL" "frontend"

log "Done"
systemctl is-active interview-coach interview-frontend
