"""Generate interview questions and ideal answers for gap skills."""

from __future__ import annotations

import json
import sys
import uuid

QUESTIONS_PER_SKILL = 5

_QUESTION_BLUEPRINTS: list[tuple[str, str, str]] = [
    (
        "experience",
        "Tell me about a time you worked with {skill}. What did you build and what was the outcome?",
        "A strong answer uses STAR format: describe the Situation, your Task, the Actions you took "
        "with {skill}, and measurable Results (latency, reliability, cost, or user impact). "
        "If you have not used {skill} in production, explain how you would ramp up—courses, a small "
        "side project, and which concepts you already know from similar tools.",
    ),
    (
        "fundamentals",
        "What is {skill} and when would you choose it over alternatives?",
        "Show you understand the core purpose of {skill}, typical use cases, trade-offs vs alternatives, "
        "and constraints (scale, consistency, cost, team skills). Mention one real scenario where "
        "{skill} is the right fit and one where it is not.",
    ),
    (
        "scenario",
        "Imagine production data issues involving {skill}. How would you debug and fix them?",
        "Walk through a structured approach: confirm symptoms, check logs/metrics, isolate the layer "
        "(ingestion, storage, query, permissions), form hypotheses, validate with minimal tests, "
        "apply a fix, and add monitoring/alerts to prevent recurrence.",
    ),
    (
        "design",
        "How would you design a small feature or pipeline that uses {skill}?",
        "Cover requirements, data model or schema, API/contracts, error handling, security, testing, "
        "and deployment. For {skill}, name specific components (indexes, collections, partitions, etc.) "
        "and why they matter.",
    ),
    (
        "depth",
        "What are best practices and common pitfalls when using {skill}?",
        "List 3–4 best practices (performance, security, operability) and 2–3 pitfalls beginners hit. "
        "Tie each point to something you would verify in code review or on-call.",
    ),
]


def generate_plan_for_skill(skill: str) -> list[dict]:
    questions: list[dict] = []
    for kind, question_tpl, answer_tpl in _QUESTION_BLUEPRINTS[:QUESTIONS_PER_SKILL]:
        questions.append(
            {
                "id": str(uuid.uuid4()),
                "skill": skill,
                "type": kind,
                "question": question_tpl.format(skill=skill),
                "idealAnswer": answer_tpl.format(skill=skill),
            }
        )
    return questions


def generate_interview_plan(gap_skills: list[str]) -> dict:
    plans = []
    for skill in gap_skills:
        trimmed = skill.strip()
        if not trimmed:
            continue
        plans.append(
            {
                "skill": trimmed,
                "questions": generate_plan_for_skill(trimmed),
            }
        )
    return {"plans": plans}


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"invalid JSON: {exc}"}))
        return 1

    gap_skills = payload.get("gapSkills") or []
    if not isinstance(gap_skills, list):
        print(json.dumps({"error": "gapSkills must be an array"}))
        return 1

    skills = [str(s) for s in gap_skills if str(s).strip()]
    if not skills:
        print(json.dumps({"error": "no gap skills provided"}))
        return 1

    print(json.dumps(generate_interview_plan(skills)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
