"""HTTP API for SpaCy gap analysis, optimize context, interview prep, and Whisper."""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills_service"
sys.path.insert(0, str(SKILLS_DIR))

from extract import analyze_gap  # noqa: E402
from interview_prep import generate_interview_plan  # noqa: E402
from optimize_context import build_optimize_context_from_text  # noqa: E402

@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Warm SpaCy model at startup so first /gap/analyze is fast."""
    try:
        from extract import _get_nlp  # noqa: PLC0415

        _get_nlp()
    except Exception as exc:  # noqa: BLE001
        print(f"[llm_layer] SpaCy warmup failed: {exc}", file=sys.stderr)
    yield


app = FastAPI(title="CareerLens LLM Layer", version="1.0.0", lifespan=lifespan)


@app.get("/")
def root() -> dict[str, str | list[str]]:
    """Azure/browser probe — use GET /health for readiness."""
    return {
        "service": "CareerLens LLM Layer",
        "health": "/health",
        "endpoints": [
            "POST /gap/analyze",
            "POST /optimize/context",
            "POST /interview/plan",
        ],
    }


def verify_secret(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    expected = os.environ.get("LLM_LAYER_SECRET", "").strip()
    if not expected:
        return
    token = (authorization or "").removeprefix("Bearer ").strip()
    if token != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


class GapRequest(BaseModel):
    resumeText: str = Field(min_length=20)
    jobDescription: str = Field(min_length=20)
    analyzedAt: str | None = None


class OptimizeContextRequest(BaseModel):
    resumeText: str = Field(min_length=20)
    jobDescription: str = Field(min_length=20)
    skill: str = Field(min_length=1)


class InterviewPlanRequest(BaseModel):
    gapSkills: list[str] = Field(min_length=1)


def _whisper_installed() -> bool:
    try:
        import whisper  # noqa: F401, PLC0415
    except ImportError:
        return False
    return True


def _require_whisper_stack() -> None:
    if _whisper_installed():
        return
    raise HTTPException(
        status_code=503,
        detail=(
            "Whisper is not installed on this host (Azure uses requirements-azure.txt). "
            "Use Azure Speech on Vercel, Cloud Run Docker + requirements-full.txt, or local Whisper."
        ),
    )


def _require_ffmpeg() -> None:
    if shutil.which("ffmpeg"):
        return
    raise HTTPException(
        status_code=503,
        detail=(
            "ffmpeg is not installed (required for Whisper). "
            "On macOS: brew install ffmpeg — then restart the LLM layer."
        ),
    )


@app.get("/health")
def health() -> dict[str, str]:
    ffmpeg_path = shutil.which("ffmpeg")
    spacy_status = "ok"
    try:
        from extract import _get_nlp  # noqa: PLC0415

        _get_nlp()
    except Exception as exc:  # noqa: BLE001
        spacy_status = str(exc)[:200]

    whisper_status = "ok" if _whisper_installed() else "disabled"
    if whisper_status == "ok" and not ffmpeg_path:
        whisper_status = "missing-ffmpeg"

    return {
        "status": "ok" if spacy_status == "ok" else "degraded",
        "ffmpeg": ffmpeg_path if ffmpeg_path else "missing",
        "spacy": spacy_status,
        "whisper": whisper_status,
    }


@app.post("/gap/analyze", dependencies=[Depends(verify_secret)])
def gap_analyze(body: GapRequest) -> dict:
    result = analyze_gap(body.resumeText, body.jobDescription)
    result["analyzedAt"] = body.analyzedAt or datetime.now(timezone.utc).replace(
        microsecond=0
    ).isoformat().replace("+00:00", "Z")
    return result


@app.post("/optimize/context", dependencies=[Depends(verify_secret)])
def optimize_context(body: OptimizeContextRequest) -> dict:
    result = build_optimize_context_from_text(
        body.resumeText,
        body.jobDescription,
        body.skill,
    )
    if result.get("error"):
        raise HTTPException(status_code=400, detail=str(result["error"]))
    return result


@app.post("/interview/plan", dependencies=[Depends(verify_secret)])
def interview_plan(body: InterviewPlanRequest) -> dict:
    skills = [str(s).strip() for s in body.gapSkills if str(s).strip()]
    if not skills:
        raise HTTPException(status_code=400, detail="no gap skills provided")
    return generate_interview_plan(skills)


@app.post("/interview/transcribe", dependencies=[Depends(verify_secret)])
async def interview_transcribe(
    file: UploadFile = File(...),
    model: str = "base",
) -> dict[str, str]:
    suffix = Path(file.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        audio_path = tmp.name

    model_name = os.environ.get("WHISPER_MODEL", model).strip() or "base"
    _require_whisper_stack()
    _require_ffmpeg()

    try:
        import whisper  # noqa: PLC0415

        whisper_model = whisper.load_model(model_name)
        result = whisper_model.transcribe(audio_path, fp16=False)
        text = (result.get("text") or "").strip()
        return {"text": text}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        Path(audio_path).unlink(missing_ok=True)
