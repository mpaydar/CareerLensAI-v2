"""SpaCy-based skill extraction and resume/JD gap analysis."""

from __future__ import annotations

import re
from pathlib import Path

import spacy
from spacy.matcher import PhraseMatcher
_SKILLS_PATH = Path(__file__).parent / "skills.txt"
_NLP: spacy.Language | None = None
_MATCHER: PhraseMatcher | None = None
_SKILL_PHRASES: list[str] = []
_SKILL_SET: set[str] = set()

_REQUIREMENT_PATTERNS = [
    re.compile(
        r"(?:experience with|experienced in|proficiency in|proficient in|"
        r"knowledge of|familiar with|expertise in|skills? in|using|including)\s+"
        r"([a-z0-9+#./\s,&-]{2,50})",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:required|requirements?|qualifications?|must have)[:\s-]+"
        r"([a-z0-9+#./\s,&-]{2,80})",
        re.IGNORECASE,
    ),
]


def _load_skill_phrases() -> list[str]:
    lines = _SKILLS_PATH.read_text(encoding="utf-8").splitlines()
    phrases: list[str] = []
    seen: set[str] = set()
    for line in lines:
        phrase = line.strip().lower()
        if not phrase or phrase in seen:
            continue
        seen.add(phrase)
        phrases.append(phrase)
    return sorted(phrases, key=len, reverse=True)


def _get_nlp() -> spacy.Language:
    global _NLP, _MATCHER, _SKILL_PHRASES, _SKILL_SET
    if _NLP is not None:
        return _NLP

    _SKILL_PHRASES = _load_skill_phrases()
    _SKILL_SET = set(_SKILL_PHRASES)
    _NLP = spacy.load("en_core_web_sm")
    _MATCHER = PhraseMatcher(_NLP.vocab, attr="LOWER")
    patterns = [_NLP.make_doc(phrase) for phrase in _SKILL_PHRASES]
    _MATCHER.add("SKILL", patterns)
    return _NLP


def read_document_text(file_path: str) -> str:
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"resume file not found: {file_path}")

    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return _read_pdf(path)
    if suffix == ".docx":
        return _read_docx(path)
    if suffix == ".doc":
        raise ValueError(
            "Legacy .doc files are not supported; save as .docx or PDF"
        )
    raise ValueError(f"unsupported file type: {suffix}")


def _read_pdf(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    parts: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            parts.append(text)
    return "\n".join(parts)


def _read_docx(path: Path) -> str:
    from docx import Document

    doc = Document(str(path))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _match_phrases_in_text(text_lower: str, found: dict[str, None]) -> None:
    for phrase in _SKILL_PHRASES:
        if len(phrase) < 2:
            continue
        pattern = r"(?<!\w)" + re.escape(phrase) + r"(?!\w)"
        if re.search(pattern, text_lower):
            found[_display_label(phrase)] = None


def _match_skills_in_fragment(fragment: str, found: dict[str, None]) -> None:
    lowered = fragment.lower()
    for phrase in _SKILL_PHRASES:
        if phrase in lowered:
            found[_display_label(phrase)] = None
    tokens = re.split(r"[,/&]| and ", lowered)
    for token in tokens:
        token = token.strip()
        if token in _SKILL_SET:
            found[_display_label(token)] = None


def _extract_from_requirement_phrases(text: str, found: dict[str, None]) -> None:
    for pattern in _REQUIREMENT_PATTERNS:
        for match in pattern.finditer(text):
            _match_skills_in_fragment(match.group(1), found)


def extract_skills(text: str) -> list[str]:
    cleaned = _normalize_whitespace(text)
    if len(cleaned) < 20:
        return []

    _get_nlp()
    found: dict[str, None] = {}
    text_lower = cleaned.lower()

    nlp = _get_nlp()
    doc = nlp(cleaned[:500_000])
    matcher = _MATCHER
    if matcher is not None:
        matches = matcher(doc)
        for _match_id, start, end in matches:
            span = doc[start:end]
            label = _canonical_skill(span.text.lower())
            if label:
                found[label] = None

    _match_phrases_in_text(text_lower, found)
    _extract_from_requirement_phrases(cleaned, found)

    return sorted(
        label for label in found.keys() if len(label.replace(" ", "")) >= 2
    )


def _canonical_skill(raw: str) -> str | None:
    _get_nlp()
    key = raw.strip().lower()
    if key in _SKILL_SET:
        return _display_label(key)
    return None


def _display_label(phrase: str) -> str:
    special = {
        "ci/cd": "CI/CD",
        "api": "API",
        "ui/ux": "UI/UX",
        "nlp": "NLP",
        "llm": "LLM",
        "rag": "RAG",
        "tdd": "TDD",
        "saas": "SaaS",
        "b2b": "B2B",
        "ios": "iOS",
        "aws": "AWS",
        "gcp": "GCP",
        "sql": "SQL",
        "jwt": "JWT",
        "oauth": "OAuth",
        "npm": "npm",
        "pnpm": "pnpm",
        "html": "HTML",
        "css": "CSS",
        "tcp/ip": "TCP/IP",
    }
    if phrase in special:
        return special[phrase]
    if phrase.endswith(".js") or phrase == "node.js":
        return phrase.replace(".js", ".js").title().replace(".Js", ".js")
    parts = phrase.replace(".", " ").split()
    titled = []
    for part in parts:
        if part in ("js", "api", "bi"):
            titled.append(part.upper())
        else:
            titled.append(part.capitalize())
    return " ".join(titled)


def focus_job_description(text: str) -> str:
    """Drop LinkedIn search chrome; keep About the job / requirements sections."""
    cleaned = text.replace("\r\n", "\n").strip()
    if len(cleaned) < 600:
        return cleaned

    lower = cleaned.lower()
    start = -1
    for marker in (
        "about the job",
        "job description",
        "about this role",
        "the role",
    ):
        idx = lower.find(marker)
        if idx >= 0 and (start < 0 or idx < start):
            start = idx
    if start > 0:
        cleaned = cleaned[start:]

    stop_markers = (
        "\nExclusive Job Seeker Insights",
        "\nAbout the company",
        "\nSet job alert for",
        "\nAre these results helpful",
        "\nCandidates who clicked apply",
    )
    for marker in stop_markers:
        idx = cleaned.find(marker)
        if idx > 150:
            cleaned = cleaned[:idx].strip()

    if len(cleaned) > 14_000:
        qual = re.search(
            r"\b(qualifications|requirements|must have|key responsibilities)\b",
            cleaned,
            re.IGNORECASE,
        )
        if qual and qual.start() > 0:
            cleaned = cleaned[max(0, qual.start() - 120) : qual.start() + 12_000]
        else:
            cleaned = cleaned[:14_000]

    return cleaned.strip()


def analyze_gap(resume_text: str, job_description: str) -> dict:
    from skill_context import enrich_gap_with_context

    job_description = focus_job_description(job_description)
    resume_skills = extract_skills(resume_text)
    jd_skills = extract_skills(job_description)

    resume_set = set(resume_skills)
    jd_set = set(jd_skills)

    matched = sorted(resume_set & jd_set)
    missing = sorted(jd_set - resume_set)
    extra = sorted(resume_set - jd_set)

    jd_count = len(jd_set)
    match_pct = round((len(matched) / jd_count) * 100) if jd_count else 0
    no_job_skills = jd_count == 0

    result: dict = {
        "resumeSkills": resume_skills,
        "jobSkills": jd_skills,
        "matched": matched,
        "missing": missing,
        "extra": [] if no_job_skills else extra,
        "matchPercent": match_pct,
        "noJobSkillsDetected": no_job_skills,
        "summary": {
            "resumeSkillCount": len(resume_set),
            "jobSkillCount": jd_count,
            "matchedCount": len(matched),
            "missingCount": len(missing),
            "extraCount": 0 if no_job_skills else len(extra),
            "contextAlignedCount": 0,
            "contextMismatchCount": 0,
        },
        "contextMatchPercent": 0,
        "contextAligned": [],
        "contextMismatch": [],
        "contextMismatchDetails": [],
        "missingInsights": [],
    }

    if no_job_skills:
        return result

    nlp = _get_nlp()
    context_block = enrich_gap_with_context(
        nlp=nlp,
        matcher=_MATCHER,
        canonical_fn=_canonical_skill,
        resume_text=resume_text,
        job_description=job_description,
        resume_skills=resume_skills,
        jd_skills=jd_skills,
        matched=matched,
        missing=missing,
        extra=extra,
    )
    result.update(context_block)
    result["summary"]["contextAlignedCount"] = context_block["summary"][
        "contextAlignedCount"
    ]
    result["summary"]["contextMismatchCount"] = context_block["summary"][
        "contextMismatchCount"
    ]

    return result
