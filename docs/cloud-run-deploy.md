# Cloud Run deploy (llm-layer)

## Two pipelines (do not confuse them)

| Pipeline | Trigger | Target |
|----------|---------|--------|
| **Google Cloud Build** | Push to `main` (Cloud Run GitHub integration) | Cloud Run `llmp-layer` |
| **Azure workflow** | Manual only (`workflow_dispatch`) | Azure `snapResume` — legacy |

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
