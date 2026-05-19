

# CareerLens-AI

Monorepo for ResumeSnap / CareerLens:

| Folder | Deploy to | Purpose |
|--------|-----------|---------|
| [`frontend/`](frontend/) | **Vercel** | Next.js app, accounts, Redis, Gemini bullet writing |
| [`llm_layer/`](llm_layer/) | **Railway** | SpaCy gap analysis, optimize context, interview prep, Whisper |
| [`frontend/chrome-extension/`](frontend/chrome-extension/) | Chrome | Job-description highlighting |

## Quick start (local)

**1. Frontend**

```bash
cd frontend
npm install
cp .env.example .env.local   # add GEMINI_API_KEY, Redis vars
npm run dev
```

**2. LLM layer** (optional but recommended for full SpaCy features)

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

### Railway

- **Root directory:** `llm_layer`
- Uses `Dockerfile` (SpaCy + Whisper)
- Env: `LLM_LAYER_SECRET` (same as Vercel)

See [frontend/README.md](frontend/README.md) and [llm_layer/README.md](llm_layer/README.md) for details.
