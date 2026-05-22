# LLM Layer

Python service for SpaCy skill gap analysis, optimize-context selection, interview question generation, and optional Whisper transcription.

**Production:** deploy to **Google Cloud Run** only (this repo). See [docs/cloud-run-deploy.md](../docs/cloud-run-deploy.md).

## Google Cloud Run

Cloud Run must build from the **`llm_layer`** directory (not `frontend/`).

| File | Purpose |
|------|---------|
| `main.py` | Exposes `app` for buildpack / gunicorn |
| `Procfile` | `web: uvicorn app.main:app …` |
| `.python-version` / `runtime.txt` | Python **3.13** |
| `requirements.txt` | Slim stack (SpaCy only — fast buildpack) |
| `Dockerfile` + `requirements-full.txt` | Optional full stack (SpaCy + Whisper) |

**Console:** Deploy from repo → **Source directory** = `llm_layer` → buildpack (or Dockerfile for Whisper).

**Runtime env (Cloud Run → Variables):**

| Variable | Value |
|----------|--------|
| `LLM_LAYER_SECRET` | Same secret as Vercel `LLM_LAYER_SECRET` |
| `WHISPER_MODEL` | Optional; only if using Docker + full requirements |

**Vercel:** `LLM_LAYER_URL=https://<cloud-run-service-url>` (no trailing slash).

**Verify:** `curl https://<url>/health` → JSON with `"spacy":"ok"`.

**GitHub Actions deploy:** `.github/workflows/deploy-cloudrun.yml` (secret `GCP_SA_KEY`).

**Smaller builds:** Default `requirements.txt` has no Whisper/torch. For voice on the LLM layer, use `Dockerfile` + `requirements-full.txt`, or Azure Speech on Vercel.

**Troubleshooting:** [docs/cloud-run-deploy.md](../docs/cloud-run-deploy.md) (placeholder page, invalid image name, Pull step failures).

**gcloud example:**

```bash
gcloud run deploy llmp-layer \
  --source llm_layer \
  --region us-south1 \
  --allow-unauthenticated \
  --set-env-vars "LLM_LAYER_SECRET=your-secret" \
  --memory 2Gi \
  --timeout 300
```

## Azure App Service (legacy, manual workflow only)

`.github/workflows/main_snapresume.yml` runs only via **workflow_dispatch**. Same env vars as Cloud Run. Whisper disabled on Azure slim deploy — use Azure Speech on Vercel for voice.

## Local development

```bash
brew install ffmpeg   # for Whisper locally

cd llm_layer
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-full.txt
python -m spacy download en_core_web_sm
uvicorn app.main:app --reload --port 8000
```

`curl http://localhost:8000/health` should include `"ffmpeg": true` when Whisper stack is installed.

`frontend/.env.local`:

```bash
LLM_LAYER_URL=http://localhost:8000
# LLM_LAYER_SECRET=your-secret
```

For voice in production without Whisper on Cloud Run, set on Vercel: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`.

## API

| Method | Path | Body |
|--------|------|------|
| GET | `/health` | — |
| POST | `/gap/analyze` | `{ resumeText, jobDescription }` |
| POST | `/optimize/context` | `{ resumeText, jobDescription, skill }` |
| POST | `/interview/plan` | `{ gapSkills: string[] }` |
| POST | `/interview/transcribe` | multipart `file` (needs full stack or returns 503 on slim deploy) |

Send `Authorization: Bearer <LLM_LAYER_SECRET>` when the secret is configured.
