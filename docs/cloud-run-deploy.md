# Cloud Run deploy (llm-layer)

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

`cloud-run-source-deploy/careerlensai-_v2/llmp-layer:<git-sha>`

1. Cloud Run → **llmp-layer** → **Edit & deploy new revision**
2. **Container image URL** → select that image (e.g. tag `c9d07fa…`)
3. Env var `LLM_LAYER_SECRET`
4. Deploy → **Manage traffic** → 100% to new revision

## Build succeeded but step “Pull” failed (`invalid reference format`)

The **Buildpack** step often **succeeds** and pushes an image to:

`us-south1-docker.pkg.dev/.../cloud-run-source-deploy/careerlensai-_v2/llmp-layer:<git-sha>`

The following **Pull** step is a known flaky step in some auto-generated Cloud Run triggers.

**Fix options:**

1. **Cloud Run console** → **llmp-layer** → **Revisions** → **Deploy new revision** → select the latest image from Artifact Registry (same SHA as the green build).
2. **Retry** the failed Cloud Build run.
3. **CLI** (after a successful buildpack):

   ```bash
   gcloud run deploy llmp-layer \
     --image us-south1-docker.pkg.dev/gen-lang-client-0977136682/cloud-run-source-deploy/careerlensai-_v2/llmp-layer:COMMIT_SHA \
     --region us-south1 \
     --allow-unauthenticated \
     --set-env-vars "LLM_LAYER_SECRET=your-secret" \
     --memory 2Gi \
     --timeout 300
   ```

## Verify

```bash
curl https://YOUR-SERVICE.run.app/health
```

Expect JSON with `"spacy":"ok"`, not HTML “Placeholder | Cloud Run”.

## Dependencies

- **`llm_layer/requirements.txt`** — slim (Cloud Run buildpacks)
- **`llm_layer/requirements-full.txt`** — Whisper/torch (Docker only)
