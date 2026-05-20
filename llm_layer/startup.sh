#!/bin/bash
# Azure → Configuration → General settings → Startup Command: bash startup.sh
set -euo pipefail
cd /home/site/wwwroot

if [ -f antenv/bin/activate ]; then
  # Oryx build creates antenv with requirements-azure.txt
  # shellcheck disable=SC1091
  source antenv/bin/activate
elif [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

if ! python -c "import en_core_web_sm" 2>/dev/null; then
  python -m spacy download en_core_web_sm
fi

PORT="${PORT:-8000}"
echo "[ResumeSnap] starting on port ${PORT}"

if python -c "import gunicorn" 2>/dev/null; then
  exec python -m gunicorn app.main:app \
    -k uvicorn.workers.UvicornWorker \
    --bind "0.0.0.0:${PORT}" \
    --timeout 600 \
    --workers 1
fi

exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT}"
