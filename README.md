

# CareerLens-AI

Monorepo for ResumeSnap / CareerLens:

| Folder | Deploy to | Purpose |
|--------|-----------|---------|
| [`frontend/`](frontend/) | **Vercel** | Next.js app, accounts, Redis, **Gemini** (resume bullets / projects only) |
| [`llm_layer/`](llm_layer/) | **Cloud Run** (buildpacks/Docker); Azure manual-only | **SpaCy** gap analysis + context fit, optimize context, interview prep |
| [`frontend/chrome-extension/`](frontend/chrome-extension/) | Chrome | Job-description highlighting |

## Quick start (local)

**1. Frontend**

```bash
cd frontend
npm install
cp .env.example .env.local   # add GEMINI_API_KEY, Redis vars
npm run dev
```

**2. LLM layer** (required for skills gap — SpaCy does not run inside Next.js)

```bash
cd llm_layer
npm run llm:setup   # from frontend/, or: python3 -m venv .venv && pip install -r requirements.txt
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Env vars must live in **`frontend/.env.local`** (Next.js does not read the repo root by default). You can also put shared keys in the repo-root `.env.local`; `next.config.ts` merges missing vars from there.

```bash
# frontend/.env.local
LLM_LAYER_URL=http://localhost:8000
```

Voice interview answers need **ffmpeg** for Whisper locally: `brew install ffmpeg`

**3. Chrome extension**

Load unpacked from `frontend/chrome-extension/` in `chrome://extensions`.

## Production

### Vercel

- **Root directory:** `frontend`
- Env: `GEMINI_API_KEY`, Upstash Redis, `LLM_LAYER_URL`, `LLM_LAYER_SECRET`, `NEXT_PUBLIC_UPGRADE_URL`

### Cloud Run (production LLM layer)

- **Source directory:** `llm_layer` (or repo root with `main.py` / `Procfile` shim)
- **Deploy:** GitHub Actions [`.github/workflows/deploy-cloudrun.yml`](.github/workflows/deploy-cloudrun.yml) (needs `GCP_SA_KEY`) and/or GCP continuous deployment — see [docs/cloud-run-deploy.md](docs/cloud-run-deploy.md)
- **Azure GitHub Action** is **manual-only** (`workflow_dispatch`) — legacy, not used for Cloud Run
- Env on Cloud Run: `LLM_LAYER_SECRET` (same as Vercel). On Vercel: `LLM_LAYER_URL` = Cloud Run service URL (no trailing slash)
- **Voice (Whisper):** use Azure Speech on Vercel (`AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION`), or local dev with `requirements-full.txt`; slim Cloud Run buildpack has SpaCy only
- After deploy: `curl $LLM_LAYER_URL/health` → JSON with `"spacy":"ok"`, not “Placeholder | Cloud Run” HTML

**Disconnect Railway:** if the repo was linked in [railway.app](https://railway.app), remove the GitHub integration there so pushes no longer deploy `lively-perfection`.

See [frontend/README.md](frontend/README.md) and [llm_layer/README.md](llm_layer/README.md) for details.
