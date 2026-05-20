"""Monorepo buildpack entry when Cloud Build uses the repository root.

Adds ``llm_layer`` to ``sys.path`` so ``app.main:app`` resolves.
"""

import sys
from pathlib import Path

_LLM_ROOT = Path(__file__).resolve().parent / "llm_layer"
if str(_LLM_ROOT) not in sys.path:
    sys.path.insert(0, str(_LLM_ROOT))

from app.main import app

__all__ = ["app"]
