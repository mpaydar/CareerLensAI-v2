#!/usr/bin/env python3
"""Transcribe audio with OpenAI Whisper. JSON in via stdin, JSON out via stdout."""

from __future__ import annotations

import json
import sys


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"invalid JSON: {exc}"}))
        return 1

    audio_path = payload.get("audioPath")
    if not audio_path:
        print(json.dumps({"error": "audioPath is required"}))
        return 1

    model_name = payload.get("model") or "base"

    try:
        import whisper  # noqa: PLC0415

        model = whisper.load_model(model_name)
        result = model.transcribe(audio_path, fp16=False)
        text = (result.get("text") or "").strip()
        print(json.dumps({"text": text}))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
