"""Buildpack entry module.

Google Cloud Buildpacks look for ``main.py`` / ``app.py`` at the deploy root.
Gunicorn default is ``main:app``; Cloud Run sets ``PORT``.
"""

from app.main import app

__all__ = ["app"]
