#!/usr/bin/env python3
"""CLI: read JSON from stdin, write gap analysis JSON to stdout."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone

from extract import analyze_gap, read_document_text


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"invalid JSON: {exc}"}))
        return 1

    resume_path = payload.get("resumePath")
    resume_text = (payload.get("resumeText") or "").strip()
    job_description = (payload.get("jobDescription") or "").strip()

    if not resume_path and not resume_text:
        print(json.dumps({"error": "resumePath or resumeText is required"}))
        return 1
    if len(job_description) < 20:
        print(json.dumps({"error": "jobDescription must be at least 20 characters"}))
        return 1

        

    try:
        if not resume_text:
            resume_text = read_document_text(resume_path)
        if len(resume_text.strip()) < 20:
            print(
                json.dumps(
                    {"error": "could not extract enough text from resume file"}
                )
            )
            return 1

        result = analyze_gap(resume_text, job_description)
        result["analyzedAt"] = payload.get("analyzedAt") or datetime.now(
            timezone.utc
        ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        print(json.dumps(result))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
