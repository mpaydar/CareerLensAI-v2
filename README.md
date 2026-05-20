

# CareerLens-AI

Monorepo for ResumeSnap / CareerLens:

| Folder | Deploy to | Purpose |
|--------|-----------|---------|
| [`frontend/`](frontend/) | **Vercel** | Next.js app, accounts, Redis, **Gemini** (resume bullets / projects only) |
| [`llm_layer/`](llm_layer/) | **Cloud Run** (buildpacks/Docker), **Railway**, Azure | **SpaCy** gap analysis + context fit, optimize context, interview prep, Whisper |
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

### Cloud Run (buildpacks)

- **Preferred source directory:** `llm_layer`
- **GitHub → Cloud Run (repo root):** `main.py`, `Procfile`, `requirements.txt`, `.python-version` (3.13) at repo root
- **Azure GitHub Action** is **manual-only** now (`workflow_dispatch`) — it does not deploy Cloud Run
- Env: `LLM_LAYER_SECRET` (same as Vercel); set Vercel `LLM_LAYER_URL` to the Cloud Run service URL
- After deploy, `curl $LLM_LAYER_URL/health` must return JSON, not “Placeholder | Cloud Run” HTML

### Railway

- **Root directory:** `llm_layer`
- Uses `Dockerfile` (SpaCy + Whisper)
- Env: `LLM_LAYER_SECRET` (same as Vercel)

See [frontend/README.md](frontend/README.md) and [llm_layer/README.md](llm_layer/README.md) for details.
