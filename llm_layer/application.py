"""Azure App Service default entry (gunicorn: application:application)."""

from app.main import app

application = app
