"""Pick minimal resume bullet + JD sentence for gap-skill GPT optimization."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from extract import _canonical_skill, _get_nlp, read_document_text
from skill_context import aggregate_context, extract_skill_mentions

# Related terms when the gap skill is not named in a bullet/sentence.
_RELATED_TERMS: dict[str, list[str]] = {
    "mongodb": ["database", "nosql", "sql", "postgres", "mysql", "document", "data store"],
    "postgresql": ["database", "sql", "postgres", "rdbms", "relational"],
    "postgres": ["database", "sql", "postgresql", "rdbms", "relational"],
    "sql": ["database", "query", "relational", "postgres", "mysql", "warehouse"],
    "redis": ["cache", "database", "in-memory", "key-value"],
    "kafka": ["streaming", "event", "message queue", "pipeline"],
    "kubernetes": ["docker", "container", "k8s", "orchestr", "deploy"],
    "terraform": ["infrastructure", "iac", "cloud", "deploy", "provision"],
    "machine learning": ["model", "ml", "data science", "training", "inference"],
    "llm": ["language model", "genai", "gpt", "nlp", "transformer"],
    "react": ["frontend", "javascript", "ui", "component", "web"],
    "aws": ["cloud", "s3", "lambda", "ec2", "infrastructure"],
    "docker": ["container", "kubernetes", "deploy", "image"],
    "airflow": ["pipeline", "workflow", "etl", "orchestr", "schedule"],
    "databricks": ["spark", "data", "lakehouse", "etl", "analytics"],
    "snowflake": ["warehouse", "sql", "analytics", "etl", "data"],
    "flask": ["python", "api", "rest", "backend", "web", "microservice", "django", "fastapi"],
    "fastapi": ["python", "api", "rest", "backend", "web", "flask", "microservice"],
    "django": ["python", "web", "backend", "api", "flask", "rest"],
    "python": ["api", "backend", "script", "data", "automation", "flask", "django"],
    "javascript": ["typescript", "node", "frontend", "react", "web", "api"],
    "typescript": ["javascript", "node", "frontend", "react", "web", "api"],
    "node": ["javascript", "typescript", "backend", "api", "express", "server"],
    "express": ["node", "javascript", "api", "backend", "rest", "web"],
}


def _skill_keys(skill: str) -> list[str]:
    lower = skill.strip().lower()
    keys = {lower, lower.replace(".", ""), lower.replace(" ", "")}
    parts = re.split(r"[\s/]+", lower)
    keys.update(p for p in parts if len(p) > 2)
    return sorted(keys, key=len, reverse=True)


def _text_mentions_skill(text: str, skill: str) -> bool:
    lower = text.lower()
    for key in _skill_keys(skill):
        if len(key) < 2:
            continue
        pattern = r"(?<!\w)" + re.escape(key) + r"(?!\w)"
        if re.search(pattern, lower):
            return True
    return False


def _related_terms(skill: str) -> list[str]:
    lower = skill.strip().lower()
    terms = list(_RELATED_TERMS.get(lower, []))
    for key, vals in _RELATED_TERMS.items():
        if key in lower or lower in key:
            terms.extend(vals)
    terms.extend(_skill_keys(skill))
    return sorted(set(terms), key=len, reverse=True)


def _score_text_for_skill(text: str, skill: str) -> int:
    lower = text.lower()
    if _text_mentions_skill(text, skill):
        return 1000 + len(text)
    score = 0
    for term in _related_terms(skill):
        if term in lower:
            score += 12 + len(term)
    return score


def _split_bullets(resume_text: str) -> list[str]:
    bullets: list[str] = []
    for raw_line in resume_text.splitlines():
        line = raw_line.strip()
        if not line or len(line) < 12:
            continue
        if line.isupper() and len(line) < 60:
            continue

        stripped = re.sub(
            r"^[\-\•\*●○▪▸►◦‣]\s*",
            "",
            line,
        )
        stripped = re.sub(r"^\d+[\.\)]\s*", "", stripped)

        if re.match(r"^[\-\•\*●○▪▸►◦‣]\s+", line) or re.match(r"^\d+[\.\)]\s+", line):
            if len(stripped) >= 12:
                bullets.append(stripped)
            continue

        if len(stripped) >= 24:
            bullets.append(stripped)

    if bullets:
        return bullets

    # Fallback: paragraph chunks
    chunks = re.split(r"\n\s*\n", resume_text)
    return [c.strip() for c in chunks if len(c.strip()) >= 24][:20]


def pick_resume_bullet(resume_text: str, skill: str, nlp=None, matcher=None) -> str:
    """Single bullet most related to the gap skill."""
    bullets = _split_bullets(resume_text)
    if not bullets:
        return resume_text.strip()[:400]

    best = max(bullets, key=lambda b: _score_text_for_skill(b, skill))
    if _score_text_for_skill(best, skill) > 0:
        return best.strip()

    # SpaCy mention sentence as fallback
    if nlp is not None and matcher is not None:
        doc = nlp(resume_text[:500_000])
        mentions = extract_skill_mentions(doc, matcher, _canonical_skill)
        for label, items in mentions.items():
            if _text_mentions_skill(label, skill) or _score_text_for_skill(label, skill) > 100:
                ctx = aggregate_context(items)
                if ctx.get("primarySentence"):
                    return ctx["primarySentence"].strip()

    return best.strip()


def _split_sentences(text: str, nlp) -> list[str]:
    doc = nlp(text[:500_000])
    return [s.text.strip() for s in doc.sents if len(s.text.strip()) >= 20]


def pick_jd_sentence(job_description: str, skill: str, nlp=None, matcher=None) -> str:
    """Single JD sentence that mentions (or best matches) the gap skill."""
    sents = _split_sentences(job_description, nlp) if nlp else []

    if not sents:
        sents = re.split(r"(?<=[.!?])\s+", job_description)
        sents = [s.strip() for s in sents if len(s.strip()) >= 20]

    direct = [s for s in sents if _text_mentions_skill(s, skill)]
    if direct:
        return max(direct, key=lambda s: _score_text_for_skill(s, skill))

    if sents:
        best = max(sents, key=lambda s: _score_text_for_skill(s, skill))
        if _score_text_for_skill(best, skill) > 0:
            return best

    if nlp is not None and matcher is not None:
        doc = nlp(job_description[:500_000])
        mentions = extract_skill_mentions(doc, matcher, _canonical_skill)
        for label, items in mentions.items():
            if _text_mentions_skill(label, skill):
                ctx = aggregate_context(items)
                if ctx.get("primarySentence"):
                    return ctx["primarySentence"].strip()

    return (sents[0] if sents else job_description.strip())[:400]


def pick_related_bullets(resume_text: str, skill: str, limit: int = 3) -> list[str]:
    bullets = _split_bullets(resume_text)
    if not bullets:
        snippet = resume_text.strip()[:400]
        return [snippet] if snippet else []

    ranked = sorted(
        bullets,
        key=lambda b: _score_text_for_skill(b, skill),
        reverse=True,
    )
    unique: list[str] = []
    for bullet in ranked:
        cleaned = bullet.strip()
        if cleaned and cleaned not in unique:
            unique.append(cleaned)
        if len(unique) >= limit:
            break
    return unique


def build_optimize_context_from_text(
    resume_text: str,
    job_description: str,
    skill: str,
) -> dict:
    skill = skill.strip()
    if not skill:
        return {"error": "skill is required"}

    if len(resume_text.strip()) < 20:
        return {"error": "resume text too short"}

    jd_text = job_description.strip()
    if len(jd_text) < 20:
        return {"error": "job description too short"}

    nlp = _get_nlp()
    from extract import _MATCHER

    matcher = _MATCHER
    resume_bullet = pick_resume_bullet(resume_text, skill, nlp, matcher)
    jd_sentence = pick_jd_sentence(jd_text, skill, nlp, matcher)
    bullet_mentions_skill = _text_mentions_skill(resume_bullet, skill)
    related_bullets = (
        [resume_bullet]
        if bullet_mentions_skill
        else pick_related_bullets(resume_text, skill)
    )

    return {
        "skill": skill,
        "resumeBullet": resume_bullet,
        "jdSentence": jd_sentence,
        "relatedBullets": related_bullets,
        "bulletMentionsSkill": bullet_mentions_skill,
    }


def build_optimize_context(resume_path: str, job_description: str, skill: str) -> dict:
    resume_text = read_document_text(resume_path)
    return build_optimize_context_from_text(resume_text, job_description, skill)


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        print(json.dumps({"error": "invalid JSON input"}))
        sys.exit(1)

    resume_path = payload.get("resumePath", "")
    resume_text = (payload.get("resumeText") or "").strip()
    job_description = payload.get("jobDescription", "")
    skill = payload.get("skill", "")

    if (not resume_path and not resume_text) or not skill:
        print(json.dumps({"error": "resumePath or resumeText and skill are required"}))
        sys.exit(1)

    try:
        if resume_text:
            result = build_optimize_context_from_text(
                resume_text, job_description, skill
            )
        else:
            result = build_optimize_context(resume_path, job_description, skill)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

    if result.get("error"):
        print(json.dumps(result))
        sys.exit(1)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
