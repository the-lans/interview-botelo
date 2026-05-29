#!/bin/bash
set -e

PROJECT=/projects/interview-botelo

wait_for_url() {
  local url=$1
  local label=$2
  local attempts=${3:-30}
  local delay=${4:-2}

  for ((i=1; i<=attempts; i++)); do
    if curl -fsS "$url" >/dev/null; then
      echo "==> ${label} is healthy"
      return 0
    fi

    echo "==> waiting for ${label} (${i}/${attempts})"
    sleep "$delay"
  done

  echo "==> ${label} did not become healthy in time"
  return 1
}

echo '==> Pull latest code'
cd $PROJECT
git pull origin main

echo '==> Install backend deps'
/projects/env-deploy/bin/pip install -e backend/ -q

echo '==> Build frontend'
cd $PROJECT/frontend
npm install --silent
npm run build

echo '==> Restart services'
systemctl restart interview-coach
systemctl restart interview-frontend

echo '==> Wait for services to become healthy'
wait_for_url http://127.0.0.1:8000/health "backend"
wait_for_url http://127.0.0.1:3000 "frontend"

echo '==> Done'
systemctl is-active interview-coach interview-frontend
