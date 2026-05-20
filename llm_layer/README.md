# LLM Layer

Python service for SpaCy skill gap analysis, optimize-context selection, interview question generation, and Whisper transcription.

Deploy this folder to [Railway](https://railway.app) (root directory: `llm_layer`) or **Azure App Service** `snapResume` via `.github/workflows/main_snapresume.yml`.

## Azure App Service (snapResume)

After GitHub Actions deploys `llm_layer` to the site root:

1. **Configuration → General settings → Startup Command:** `bash startup.sh`
2. **Application settings:** `LLM_LAYER_SECRET`, optional `WHISPER_MODEL` (same names as Railway)
3. **Verify:** `curl https://<your-app>.azurewebsites.net/health`
4. Set Vercel `LLM_LAYER_URL` to that URL (not localhost).

**Whisper:** Azure deploy uses `requirements-azure.txt` (no `openai-whisper` / PyTorch) so Oryx does not run out of disk. `/health` shows `"whisper":"disabled"`. Gap analysis and interview questions work on Azure; **voice transcription** should use Railway/Docker (`requirements.txt` + `Dockerfile`).

**ffmpeg:** Not needed on Azure when Whisper is disabled.

## Local development

```bash
# Whisper needs ffmpeg on your PATH (macOS)
brew install ffmpeg

cd llm_layer
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
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
