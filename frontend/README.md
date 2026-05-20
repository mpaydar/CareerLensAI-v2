# CareerLens-AI-

Next.js app with the ResumeSnap browser extension for job-description highlighting and resume tailoring.

## Getting Started (local)

From the repo root, work inside this folder (`frontend/` is the Vercel root):

```bash
cd frontend
npm install
npm run dev
```

For SpaCy gap analysis and Whisper locally, run the Python service in `../llm_layer` and set `LLM_LAYER_URL=http://localhost:8000` in `.env.local`. See [../llm_layer/README.md](../llm_layer/README.md).

Open [http://localhost:3000](http://localhost:3000) in your browser.

Load the extension from `frontend/chrome-extension/` via `chrome://extensions` (Developer mode → Load unpacked).

## Vercel project settings

In the Vercel dashboard, set **Root Directory** to `frontend` (not the repo root).

Add `LLM_LAYER_URL` and `LLM_LAYER_SECRET` pointing at your Railway deployment for full SpaCy/Whisper features in production.

## Vercel + extension setup

Highlights did not work on Vercel for two reasons:

1. The extension only posted to `localhost` — configure your deployed URL in extension options.
2. Vercel serverless cannot persist `.highlight-state.json` on disk — use Redis for shared state.

### 1. Add Redis on Vercel

In the [Vercel dashboard](https://vercel.com) → your project → **Storage** → create **Upstash Redis** (or add Redis from the Marketplace).

Redeploy so these env vars exist (names may vary slightly):

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Legacy Vercel KV projects may still use `KV_REST_API_URL` / `KV_REST_API_TOKEN`; those are supported too.

### 2. Configure the extension

1. Reload the extension at `chrome://extensions`.
2. Open **ResumeSnap → Extension options** (or right-click the extension → Options).
3. Enter your **production** Vercel URL (e.g. `https://career-lens-ai.vercel.app`), not a preview URL, and click **Save**.
4. Approve host permission when Chrome prompts.

Opening the dashboard tab also syncs the API base to that tab’s origin automatically.

**Preview deployments (`*-projects.vercel.app`)** often have [Vercel Deployment Protection](https://vercel.com/docs/security/deployment-protection). The extension cannot send highlights through the login wall unless you disable protection for previews, use production, or paste a **Protection Bypass** secret in extension options (Vercel → Project → Settings → Deployment Protection).

### 3. Test

1. Open your Vercel app in a tab (the UI polls `/api/highlight`).
2. On LinkedIn (or any site), highlight job description text.
3. The highlight box on your Vercel app should update within a few seconds.

If it still fails, check the extension popup or service worker console (`chrome://extensions` → ResumeSnap → **Service worker**) for `[ResumeSnap] POST` errors (401 = deployment protection, 503 = missing Redis).

## Accounts & free tier

First visit shows onboarding (first name, last name, resume upload). An account is created and stored in Redis with a session cookie.

- **Usage banner** — shows remaining free AI credits (3 per month)
- **Upgrade modal** — appears when credits are exhausted (set `NEXT_PUBLIC_UPGRADE_URL` to your Stripe/checkout link)

`middleware.ts` limits Gemini AI routes to **3 POST requests per user per 30 days** (shared across `/api/optimize` and `/api/projects/*`). Requires Upstash Redis. Highlights and skill gap analysis stay free.
