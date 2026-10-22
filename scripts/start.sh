#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

docker build -t pm .
docker rm -f pm >/dev/null 2>&1 || true
mkdir -p data
docker run -d --name pm --env-file .env -p 8000:8000 -v "$(pwd)/data:/app/data" pm
echo "Running at http://localhost:8000"
