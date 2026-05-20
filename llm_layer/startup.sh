#!/bin/bash
# Azure App Service Linux: set Startup Command to: bash startup.sh
set -euo pipefail
cd /home/site/wwwroot

# Oryx should install deps; ensure SpaCy model exists on cold start
if ! python -c "import en_core_web_sm" 2>/dev/null; then
  python -m spacy download en_core_web_sm
fi

exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
