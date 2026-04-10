#!/bin/bash
set -e

PROJECT=/projects/interview-botelo

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

echo '==> Done'
systemctl is-active interview-coach interview-frontend
