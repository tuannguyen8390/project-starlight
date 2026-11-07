#!/bin/bash
set -e
cd "$(dirname "$0")"
if [ ! -f frontend/dist/index.html ]; then
  echo "Building the frontend..."
  (cd frontend && npm install && npm run build)
fi
echo "=== Project Starlight ===  http://localhost:8504"
cd backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8504
