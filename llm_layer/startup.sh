#!/bin/bash
# Azure → Configuration → Startup Command: bash startup.sh
set -euo pipefail
cd /home/site/wwwroot

if ! python -c "import en_core_web_sm" 2>/dev/null; then
  python -m spacy download en_core_web_sm
fi

PORT="${PORT:-8000}"
if python -c "import gunicorn" 2>/dev/null; then
  exec python -m gunicorn app.main:app \
    -k uvicorn.workers.UvicornWorker \
    --bind "0.0.0.0:${PORT}" \
    --timeout 600 \
    --workers 1
fi

exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT}"
