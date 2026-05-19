"""SpaCy contextual analysis: how and where skills are used in JD vs resume."""

from __future__ import annotations

from collections import defaultdict

# Environment / project-type signals (keyword → label)
_ENVIRONMENT_LEXICON: dict[str, list[str]] = {
    "GenAI / LLM": [
        "generative",
        "genai",
        "llm",
        "large language",
        "gpt",
        "chatbot",
        "fine-tune",
        "fine tune",
        "finetune",
        "prompt",
        "rag",
        "retrieval augmented",
        "diffusion",
        "hugging face",
        "langchain",
        "transformer",
        "embedding",
        "vector database",
        "openai",
        "anthropic",
        "copilot",
    ],
    "Data engineering": [
        "pipeline",
        "etl",
        "elt",
        "ingestion",
        "airflow",
        "spark",
        "warehouse",
        "snowflake",
        "databricks",
        "kafka",
        "batch",
        "streaming",
        "data lake",
        "data platform",
        "dbt",
        "flink",
        "hive",
        "presto",
        "trino",
    ],
    "Backend / API": [
        "api",
        "rest",
        "graphql",
        "microservice",
        "fastapi",
        "flask",
        "django",
        "backend",
        "endpoint",
        "server-side",
        "grpc",
        "postgresql",
        "postgres",
        "mysql",
        "redis",
        "nosql",
        "mongodb",
    ],
    "Cloud / DevOps": [
        "aws",
        "azure",
        "gcp",
        "kubernetes",
        "k8s",
        "docker",
        "terraform",
        "ci/cd",
        "cicd",
        "deploy",
        "infrastructure",
        "serverless",
        "lambda",
        "devops",
        "helm",
        "ansible",
        "cloudformation",
        "pulumi",
    ],
    "Production / scale": [
        "production",
        "prod",
        "on-call",
        "on call",
        "sla",
        "uptime",
        "high traffic",
        "scalability",
        "millions",
        "latency",
        "reliability",
        "observability",
        "monitoring",
        "sre",
    ],
    "Data science / ML": [
        "machine learning",
        "deep learning",
        "model",
        "training",
        "inference",
        "tensorflow",
        "pytorch",
        "scikit",
        "experiment",
        "feature",
        "computer vision",
        "nlp",
        "classification",
        "regression",
        "forecast",
        "analytics",
        "jupyter",
        "notebook",
    ],
    "Frontend": [
        "frontend",
        "front-end",
        "react",
        "vue",
        "angular",
        "next.js",
        "nextjs",
        "ui",
        "ux",
        "css",
        "component",
        "web app",
        "typescript",
    ],
    "Security / compliance": [
        "security",
        "compliance",
        "hipaa",
        "soc2",
        "gdpr",
        "authentication",
        "encryption",
        "iam",
        "zero trust",
    ],
    "Agile / product": [
        "agile",
        "scrum",
        "stakeholder",
        "cross-functional",
        "product",
        "roadmap",
        "sprint",
        "kanban",
    ],
}

# Closely related environments count as partial overlap (not a mismatch).
_TAG_RELATED: dict[str, frozenset[str]] = {
    "GenAI / LLM": frozenset(
        {"Data science / ML", "Backend / API", "Data engineering"}
    ),
    "Data engineering": frozenset(
        {
            "Data science / ML",
            "Cloud / DevOps",
            "Production / scale",
            "Backend / API",
        }
    ),
    "Data science / ML": frozenset(
        {"Data engineering", "GenAI / LLM", "Production / scale"}
    ),
    "Backend / API": frozenset(
        {"Cloud / DevOps", "Production / scale", "Data engineering", "Frontend"}
    ),
    "Cloud / DevOps": frozenset(
        {"Backend / API", "Production / scale", "Data engineering", "Security / compliance"}
    ),
    "Production / scale": frozenset(
        {"Cloud / DevOps", "Backend / API", "Data engineering", "Data science / ML"}
    ),
    "Frontend": frozenset({"Backend / API", "Agile / product"}),
    "Security / compliance": frozenset({"Cloud / DevOps", "Backend / API"}),
    "Agile / product": frozenset({"Frontend", "Data science / ML"}),
}

_CONTEXT_ALIGNED_THRESHOLD = 38
_SENTENCE_WINDOW = 2
_DOC_TAG_SAMPLE_CHARS = 80_000


def _tags_for_text(text: str) -> list[str]:
    lower = text.lower()
    tags: list[str] = []
    for label, keywords in _ENVIRONMENT_LEXICON.items():
        if any(kw in lower for kw in keywords):
            tags.append(label)
    return tags


def _document_environment_tags(text: str) -> list[str]:
    """Whole-document environment profile (fallback when a mention is sparse)."""
    return sorted(set(_tags_for_text(text[:_DOC_TAG_SAMPLE_CHARS])))


def _expanded_context_text(doc, sent, window: int = _SENTENCE_WINDOW) -> str:
    """Skill sentence plus neighboring sentences for richer tag extraction."""
    if sent is None:
        return ""
    sents = list(doc.sents)
    try:
        idx = sents.index(sent)
    except ValueError:
        return sent.text.strip()
    start = max(0, idx - window)
    end = min(len(sents), idx + window + 1)
    return " ".join(s.text.strip() for s in sents[start:end] if s.text.strip())


def _verbs_in_sentence(sent) -> list[str]:
    verbs: list[str] = []
    for token in sent:
        if token.pos_ in ("VERB", "AUX") and not token.is_stop:
            lemma = token.lemma_.lower()
            if len(lemma) > 2:
                verbs.append(lemma)
    return verbs[:8]


def _role_phrase(sent, span) -> str:
    """Short phrase: what is being done with the skill (verb + object)."""
    skill_token = span[0] if len(span) else None
    if skill_token is None:
        return ""

    verb = None
    for child in skill_token.children:
        if child.dep_ in ("acl", "advcl") and child.pos_ == "VERB":
            verb = child
            break
    if verb is None:
        for token in sent:
            if token.pos_ == "VERB" and token.i < skill_token.i:
                verb = token
                break
    if verb is None:
        for token in sent:
            if token.pos_ == "VERB":
                verb = token
                break

    if verb is not None:
        return f"{verb.lemma_} … {span.text}".strip()[:80]
    return span.text[:80]


def _mention_from_span(doc, sent, span) -> dict:
    expanded = _expanded_context_text(doc, sent)
    sent_text = (expanded or sent.text).strip()
    env_tags = _tags_for_text(sent_text)
    return {
        "sentence": sent_text[:400],
        "environmentTags": env_tags,
        "actionVerbs": _verbs_in_sentence(sent),
        "rolePhrase": _role_phrase(sent, span),
    }


def extract_skill_mentions(doc, matcher, canonical_fn) -> dict[str, list[dict]]:
    """Map display skill label → list of contextual mentions."""
    by_skill: dict[str, list[dict]] = defaultdict(list)
    if matcher is None:
        return by_skill

    seen: set[tuple[str, int, int]] = set()
    for _match_id, start, end in matcher(doc):
        span = doc[start:end]
        label = canonical_fn(span.text.lower())
        if not label:
            continue
        key = (label, span.start, span.end)
        if key in seen:
            continue
        seen.add(key)
        sent = span.sent
        if sent is None:
            continue
        by_skill[label].append(_mention_from_span(doc, sent, span))

    return by_skill


def aggregate_context(
    mentions: list[dict],
    *,
    document_tags: list[str] | None = None,
) -> dict:
    if not mentions:
        tags = list(document_tags or [])
        return {
            "environmentTags": tags,
            "actionVerbs": [],
            "primarySentence": "",
            "sampleSentences": [],
            "rolePhrases": [],
        }

    tags: list[str] = []
    verbs: list[str] = []
    sentences: list[str] = []
    roles: list[str] = []

    for m in mentions:
        tags.extend(m.get("environmentTags", []))
        verbs.extend(m.get("actionVerbs", []))
        if m.get("sentence"):
            sentences.append(m["sentence"])
        if m.get("rolePhrase"):
            roles.append(m["rolePhrase"])

    skill_tags = sorted(set(tags))
    doc_tags = document_tags or []

    # If mentions have few tags, blend in document-level signals (same job family).
    if len(skill_tags) < 2 and doc_tags:
        for tag in doc_tags:
            if tag not in skill_tags:
                skill_tags.append(tag)

    return {
        "environmentTags": skill_tags,
        "actionVerbs": sorted(set(verbs))[:10],
        "primarySentence": sentences[0] if sentences else "",
        "sampleSentences": sentences[:3],
        "rolePhrases": roles[:3],
    }


def _related_match_weight(jd_tag: str, res_tag: str) -> float:
    if jd_tag == res_tag:
        return 1.0
    if res_tag in _TAG_RELATED.get(jd_tag, frozenset()):
        return 0.65
    if jd_tag in _TAG_RELATED.get(res_tag, frozenset()):
        return 0.65
    return 0.0


def _tag_overlap_score(jd_tags: set[str], res_tags: set[str]) -> float:
    if not jd_tags and not res_tags:
        return 0.55
    if not jd_tags or not res_tags:
        return 0.0

    exact = jd_tags & res_tags
    if exact:
        union = len(jd_tags | res_tags)
        exact_ratio = len(exact) / union if union else 0.0
    else:
        exact_ratio = 0.0

    related_pairs = 0.0
    for jt in jd_tags:
        for rt in res_tags:
            if jt != rt:
                related_pairs += _related_match_weight(jt, rt)

    related_ratio = 0.0
    if related_pairs > 0:
        denom = max(len(jd_tags), len(res_tags), 1)
        related_ratio = min(0.45, related_pairs / denom)

    return min(1.0, exact_ratio + related_ratio)


def _role_overlap(jd_ctx: dict, resume_ctx: dict) -> int:
    jd_roles = " ".join(jd_ctx.get("rolePhrases", [])).lower()
    res_roles = " ".join(resume_ctx.get("rolePhrases", [])).lower()
    if not jd_roles or not res_roles:
        return 0
    jd_words = {w for w in jd_roles.split() if len(w) > 3}
    res_words = {w for w in res_roles.split() if len(w) > 3}
    if not jd_words or not res_words:
        return 0
    overlap = len(jd_words & res_words)
    if overlap >= 2:
        return 10
    if overlap == 1:
        return 5
    return 0


def alignment_score(
    jd_ctx: dict,
    resume_ctx: dict,
    *,
    jd_document_tags: list[str] | None = None,
    resume_document_tags: list[str] | None = None,
) -> int:
    jd_tags = set(jd_ctx.get("environmentTags", []))
    res_tags = set(resume_ctx.get("environmentTags", []))

    overlap = _tag_overlap_score(jd_tags, res_tags)

    # Sparse mention context: compare against whole-document environment.
    if overlap < 0.35 and jd_document_tags and resume_document_tags:
        doc_overlap = _tag_overlap_score(
            set(jd_document_tags), set(resume_document_tags)
        )
        if doc_overlap > overlap:
            overlap = overlap * 0.4 + doc_overlap * 0.6

    # Both sides mention the skill but neither sentence carried tags — neutral-positive.
    if not jd_tags and not res_tags:
        if jd_document_tags and resume_document_tags:
            doc_only = _tag_overlap_score(
                set(jd_document_tags), set(resume_document_tags)
            )
            base = round(48 + doc_only * 22)
        else:
            base = 52
    elif not jd_tags or not res_tags:
        populated = jd_tags or res_tags
        doc_other = set(resume_document_tags or []) if jd_tags else set(jd_document_tags or [])
        if doc_other:
            partial = sum(
                1.0 if t in doc_other else 0.65
                if any(_related_match_weight(t, d) >= 0.65 for d in doc_other)
                else 0.0
                for t in populated
            )
            base = round(36 + min(40, partial * 14))
        else:
            base = 44
    else:
        base = round(28 + overlap * 72)

    jd_verbs = set(jd_ctx.get("actionVerbs", []))
    res_verbs = set(resume_ctx.get("actionVerbs", []))
    if jd_verbs and res_verbs:
        verb_inter = len(jd_verbs & res_verbs)
        if verb_inter > 0:
            base = min(100, base + 10)
        elif overlap >= 0.5:
            base = min(100, base + 4)
        elif base > 50 and overlap < 0.2:
            base = max(32, base - 8)

    base += _role_overlap(jd_ctx, resume_ctx)

    # Any exact shared environment → at least threshold (clear contextual match).
    if jd_tags & res_tags:
        base = max(base, _CONTEXT_ALIGNED_THRESHOLD + 4)

    # Strong related-only overlap (e.g. DE job + DE resume, tags phrased differently).
    if overlap >= 0.45 and base < _CONTEXT_ALIGNED_THRESHOLD:
        base = _CONTEXT_ALIGNED_THRESHOLD + 2

    return max(0, min(100, base))


def _format_tag_list(tags: list[str]) -> str:
    if not tags:
        return "general technical work"
    return ", ".join(tags[:4])


def build_insight(skill: str, jd_ctx: dict, resume_ctx: dict, score: int) -> str:
    jd_tags = jd_ctx.get("environmentTags", [])
    res_tags = resume_ctx.get("environmentTags", [])
    jd_sent = jd_ctx.get("primarySentence", "")
    res_sent = resume_ctx.get("primarySentence", "")

    if score >= _CONTEXT_ALIGNED_THRESHOLD:
        shared = sorted(set(jd_tags) & set(res_tags))
        if shared:
            return (
                f"{skill} appears in a similar setting on both sides "
                f"({ _format_tag_list(shared) })."
            )
        return (
            f"{skill} is used in comparable technical contexts in the job description "
            f"and your resume."
        )

    parts = [
        f"{skill} matches by keyword, but the job and your resume emphasize different work settings."
    ]
    if jd_tags or res_tags:
        parts.append(
            f"JD context: {_format_tag_list(jd_tags)}. "
            f"Resume context: {_format_tag_list(res_tags)}."
        )
    if jd_sent and res_sent and jd_sent[:40] != res_sent[:40]:
        parts.append(
            f'Job: "{jd_sent[:120]}…" vs your resume: "{res_sent[:120]}…"'
        )
    return " ".join(parts)


def needed_for_summary(jd_ctx: dict) -> str:
    tags = jd_ctx.get("environmentTags", [])
    roles = jd_ctx.get("rolePhrases", [])
    sent = jd_ctx.get("primarySentence", "")

    if tags and roles:
        return f"Needed for { _format_tag_list(tags) } — e.g. {roles[0]}"
    if tags:
        return f"Needed in a {_format_tag_list(tags)} environment"
    if sent:
        return f"Required in context: \"{sent[:140]}…\""
    return "Listed as a requirement in the job description"


def enrich_gap_with_context(
    *,
    nlp,
    matcher,
    canonical_fn,
    resume_text: str,
    job_description: str,
    resume_skills: list[str],
    jd_skills: list[str],
    matched: list[str],
    missing: list[str],
    extra: list[str],
) -> dict:
    resume_doc = nlp(resume_text[:500_000])
    jd_doc = nlp(job_description[:500_000])

    jd_document_tags = _document_environment_tags(job_description)
    resume_document_tags = _document_environment_tags(resume_text)

    resume_mentions = extract_skill_mentions(resume_doc, matcher, canonical_fn)
    jd_mentions = extract_skill_mentions(jd_doc, matcher, canonical_fn)

    context_aligned: list[str] = []
    context_mismatch: list[str] = []
    context_mismatch_details: list[dict] = []
    missing_insights: list[dict] = []

    for skill in matched:
        jd_ctx = aggregate_context(
            jd_mentions.get(skill, []),
            document_tags=jd_document_tags,
        )
        res_ctx = aggregate_context(
            resume_mentions.get(skill, []),
            document_tags=resume_document_tags,
        )
        score = alignment_score(
            jd_ctx,
            res_ctx,
            jd_document_tags=jd_document_tags,
            resume_document_tags=resume_document_tags,
        )
        if score >= _CONTEXT_ALIGNED_THRESHOLD:
            context_aligned.append(skill)
        else:
            context_mismatch.append(skill)
            context_mismatch_details.append(
                {
                    "skill": skill,
                    "alignmentScore": score,
                    "jdContext": jd_ctx,
                    "resumeContext": res_ctx,
                    "insight": build_insight(skill, jd_ctx, res_ctx, score),
                }
            )

    for skill in missing:
        jd_ctx = aggregate_context(
            jd_mentions.get(skill, []),
            document_tags=jd_document_tags,
        )
        missing_insights.append(
            {
                "skill": skill,
                "jdContext": jd_ctx,
                "neededFor": needed_for_summary(jd_ctx),
            }
        )

    jd_count = len(jd_skills)
    context_match_pct = (
        round((len(context_aligned) / jd_count) * 100) if jd_count else 0
    )

    return {
        "contextMatchPercent": context_match_pct,
        "contextAligned": sorted(context_aligned),
        "contextMismatch": sorted(context_mismatch),
        "contextMismatchDetails": context_mismatch_details,
        "missingInsights": missing_insights,
        "summary": {
            "contextAlignedCount": len(context_aligned),
            "contextMismatchCount": len(context_mismatch),
        },
    }
