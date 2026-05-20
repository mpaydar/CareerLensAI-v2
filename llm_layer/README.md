# LLM Layer

Python service for SpaCy skill gap analysis, optimize-context selection, interview question generation, and Whisper transcription.

Deploy this folder to [Railway](https://railway.app) (root directory: `llm_layer`), **Google Cloud Run** (buildpacks or Docker), or **Azure App Service** `snapResume` via `.github/workflows/main_snapresume.yml`.

## Google Cloud Run (buildpacks)

Cloud Run must build from the **`llm_layer`** directory (not the monorepo root or `frontend/`).

Buildpack entry files in this folder:

| File | Purpose |
|------|---------|
| `main.py` | Exposes `app` for `gunicorn main:app` / buildpack detection |
| `Procfile` | `web: uvicorn app.main:app …` (overrides default) |
| `.python-version` / `runtime.txt` | Python **3.13** (ubuntu2404 buildpack has 3.13–3.14 only, not 3.11) |
| `requirements.txt` | Dependencies (full stack; large build) |

**Create service (console):** Deploy from repo → **Source directory** = `llm_layer` → buildpack (not Dockerfile).

**Runtime env (Cloud Run → Variables):**

| Variable | Value |
|----------|--------|
| `LLM_LAYER_SECRET` | Same secret as Vercel `LLM_LAYER_SECRET` |

**Vercel:** `LLM_LAYER_URL=https://<cloud-run-service-url>` (no trailing slash).

**Verify:** `curl https://<url>/health` → JSON with `"spacy":"ok"`.

**Smaller / faster builds (no Whisper):** Before deploy, use `requirements-azure.txt` as the install list (rename or replace `requirements.txt` for that deploy only), or switch to Docker later. Whisper needs `requirements.txt` + `Dockerfile`.

**If build fails with “unknown project descriptor schema version”:** Remove `project.toml`; use `Procfile` + `main.py` + `.python-version` only.

**If build fails with “Missing Entrypoint”:** Set source directory to `llm_layer`, or use repo-root shim (`/main.py`, `/Procfile`, `/requirements.txt`).

**If `/health` returns HTML “Placeholder | Cloud Run”:** The FastAPI app never deployed — redeploy after a successful build; check Logs for `uvicorn` startup.

**gcloud example:**

```bash
gcloud run deploy llm-layer \
  --source llm_layer \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "LLM_LAYER_SECRET=your-secret" \
  --memory 2Gi \
  --timeout 300
```

## Azure App Service (snapResume)

After GitHub Actions deploys `llm_layer` to the site root:

1. **Configuration → General settings → Startup Command:** `bash startup.sh`  
   (If you skip this, Azure may run the default Flask placeholder and every URL returns HTML `404 Not Found`.)
2. **Application settings:** `LLM_LAYER_SECRET`, optional `WHISPER_MODEL` (same names as Railway)
3. **Verify:** `curl https://<your-app>.azurewebsites.net/health` → JSON with `"spacy":"ok"`  
   Root `GET /` should return JSON `service`, not HTML.
4. Set Vercel `LLM_LAYER_URL` to that URL (not localhost).

**Troubleshooting HTML 404:** Wrong app is running. Set startup command, **Save**, then **Restart** the App Service. Check **Log stream** for `uvicorn` or `gunicorn` startup lines.

**Whisper:** Azure deploy uses `requirements-azure.txt` (no `openai-whisper` / PyTorch) so Oryx does not run out of disk. `/health` shows `"whisper":"disabled"`. Gap analysis and interview questions work on Azure; **voice transcription** should use Railway/Docker (`requirements.txt` + `Dockerfile`).

**ffmpeg:** Not needed on Azure when Whisper is disabled.

## Local development

```bash
# Whisper needs ffmpeg on your PATH (macOS)
brew install ffmpeg

cd llm_layer
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-full.txt
python -m spacy download en_core_web_sm
uvicorn app.main:app --reload --port 8000
```

Check setup: `curl http://localhost:8000/health` should include `"ffmpeg": true`.

Set in `frontend/.env.local`:

```bash
LLM_LAYER_URL=http://localhost:8000
# Optional shared secret (must match Railway env)
# LLM_LAYER_SECRET=your-secret
```

## Railway environment

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_LAYER_SECRET` | Recommended | Bearer token; set the same value on Vercel as `LLM_LAYER_SECRET` |
| `WHISPER_MODEL` | No | Whisper model name (default `base`) |
| `PORT` | Auto | Set by Railway |

## API

| Method | Path | Body |
|--------|------|------|
| GET | `/health` | — |
| POST | `/gap/analyze` | `{ resumeText, jobDescription }` |
| POST | `/optimize/context` | `{ resumeText, jobDescription, skill }` |
| POST | `/interview/plan` | `{ gapSkills: string[] }` |
| POST | `/interview/transcribe` | multipart `file` |

Send `Authorization: Bearer <LLM_LAYER_SECRET>` when the secret is configured.
