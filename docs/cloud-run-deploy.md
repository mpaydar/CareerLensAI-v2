# Cloud Run deploy (llm-layer)

## Buildpack green, Pull fails (`invalid reference format`)

**Root cause:** GitHub repo [`CareerLensAI-_V2`](https://github.com/mpaydar/CareerLensAI-_V2) becomes image path `careerlensai-_v2`. That segment is **invalid** for Docker/OCI (`_` immediately followed by `-`). The buildpack step can still push the image; the auto-generated **Pull** step then fails.

**Permanent fix (recommended):**

1. GitHub → repo **Settings** → **General** → rename to `CareerLensAI-v2` (no `_` before `V`).
2. Update local `git remote` URL if needed.
3. Cloud Run → **llmp-layer** → reconnect continuous deployment to the renamed repo (or edit the Cloud Build trigger so image paths use `careerlensai-v2`).

**Workarounds without renaming:**

| Option | What to do |
|--------|------------|
| **GitHub Actions** | Add secret `GCP_SA_KEY`; workflow `.github/workflows/deploy-cloudrun.yml` runs `gcloud run deploy --source llm_layer` (skips the broken Pull step). |
| **Manual deploy** | After a green Buildpack, Cloud Run → **Deploy revision** → pick the image tag from Artifact Registry. |
| **Custom `cloudbuild.yaml`** | Point the trigger at repo `cloudbuild.yaml` (valid `_IMAGE_NAME` default: `.../careerlensai-v2/llmp-layer:${COMMIT_SHA}`). Remove extra Pull/Push steps if you added them on top of `--publish`. |

## Placeholder page at `/health`

If curl returns HTML **“Sorry, this is just a placeholder…”**, Cloud Run is serving the **default revision** — your FastAPI image **never deployed** (build failed, or Deploy/Pull step failed).

**Fix:** deploy a real revision (below).

## Two pipelines (do not confuse them)

| Pipeline | Trigger | Target |
|----------|---------|--------|
| **Google Cloud Build** | Push to `main` (Cloud Run GitHub integration) | Cloud Run `llmp-layer` |
| **Azure workflow** | Manual only (`workflow_dispatch`) | Azure `snapResume` — legacy |
| **GitHub `deploy-cloudrun.yml`** | Push to `main` (if `GCP_SA_KEY` set) | Cloud Run `llmp-layer` via `gcloud run deploy --source` |

### GitHub Action setup (recommended)

1. GCP → IAM → Service account → create key (JSON) with roles:
   - Cloud Run Admin
   - Service Account User
   - Cloud Build Editor (for `--source` builds)
   - Storage Admin (artifact upload during source deploy)
2. GitHub repo → Settings → Secrets → Actions:
   - `GCP_SA_KEY` = full JSON key
   - `LLM_LAYER_SECRET` = same value as Vercel
3. Push to `main` or run workflow **Deploy llm-layer to Cloud Run** manually.
4. `curl https://YOUR-URL/health` → JSON with `"spacy":"ok"`.

### Manual deploy (gcloud CLI)

```bash
gcloud auth login
gcloud config set project gen-lang-client-0977136682

gcloud run deploy llmp-layer \
  --region us-south1 \
  --source llm_layer \
  --allow-unauthenticated \
  --memory 2Gi \
  --timeout 300 \
  --set-env-vars "LLM_LAYER_SECRET=YOUR_SECRET"
```

### Manual deploy (console, image already built)

If **Buildpack** succeeded but **Pull/Deploy** failed, the image is in **Artifact Registry**:

`cloud-run-source-deploy/careerlensai-v2/llmp-layer:<git-sha>` (after repo rename; legacy path was `careerlensai-_v2`)

1. Cloud Run → **llmp-layer** → **Edit & deploy new revision**
2. **Container image URL** → select that image (e.g. tag `c9d07fa…`)
3. Env var `LLM_LAYER_SECRET`
4. Deploy → **Manage traffic** → 100% to new revision

## Verify

```bash
curl https://YOUR-SERVICE.run.app/health
```

Expect JSON with `"spacy":"ok"`, not HTML “Placeholder | Cloud Run”.

## Dependencies

- **`llm_layer/requirements.txt`** — slim (Cloud Run buildpacks)
- **`llm_layer/requirements-full.txt`** — Whisper/torch (Docker only)
