"""Lightweight tests for contextual alignment scoring."""

from skill_context import (
    _CONTEXT_ALIGNED_THRESHOLD,
    _tag_overlap_score,
    aggregate_context,
    alignment_score,
)


def test_both_empty_tags_neutral_positive():
    score = alignment_score(
        {"environmentTags": [], "actionVerbs": [], "rolePhrases": []},
        {"environmentTags": [], "actionVerbs": [], "rolePhrases": []},
        jd_document_tags=["Data engineering", "Cloud / DevOps"],
        resume_document_tags=["Data engineering", "Cloud / DevOps"],
    )
    assert score >= _CONTEXT_ALIGNED_THRESHOLD


def test_shared_exact_tags_align():
    jd = {"environmentTags": ["Data engineering", "Cloud / DevOps"], "actionVerbs": ["build"], "rolePhrases": []}
    res = {"environmentTags": ["Data engineering", "Cloud / DevOps"], "actionVerbs": ["build"], "rolePhrases": []}
    assert alignment_score(jd, res) >= _CONTEXT_ALIGNED_THRESHOLD


def test_related_tags_partial_credit():
    overlap = _tag_overlap_score(
        {"Data engineering"},
        {"Data science / ML"},
    )
    assert overlap >= 0.4


def test_aggregate_blends_document_tags():
    ctx = aggregate_context(
        [{"environmentTags": [], "actionVerbs": [], "sentence": "Used Python daily.", "rolePhrase": ""}],
        document_tags=["Data engineering"],
    )
    assert "Data engineering" in ctx["environmentTags"]


def test_clear_mismatch_stays_low():
    jd = {"environmentTags": ["Frontend"], "actionVerbs": [], "rolePhrases": []}
    res = {"environmentTags": ["Security / compliance"], "actionVerbs": [], "rolePhrases": []}
    score = alignment_score(
        jd,
        res,
        jd_document_tags=["Frontend"],
        resume_document_tags=["Security / compliance"],
    )
    assert score < _CONTEXT_ALIGNED_THRESHOLD
