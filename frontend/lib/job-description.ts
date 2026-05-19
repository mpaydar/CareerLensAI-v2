/**
 * Trim noisy LinkedIn / search-page highlights down to job-description content
 * so SpaCy skill extraction sees requirements instead of nav chrome.
 */

const TECH_SIGNAL =
  /\b(python|sql|spark|airflow|snowflake|aws|kubernetes|docker|terraform|kafka|dbt|typescript|java|react)\b/i;

const INFORMAL_JD_START =
  /(?:about the job|job description|about this role|you'd be helping|you would be helping|the kind of background|what you'll do|what you will do|key responsibilities|qualifications|requirements|bonus points)/i;

function hasTechSignals(text: string): boolean {
  return TECH_SIGNAL.test(text);
}

export function focusJobDescription(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) {
    return "";
  }

  if (text.length < 600) {
    return text;
  }

  const lower = text.toLowerCase();

  const startMarkers = [
    "about the job",
    "job description",
    "about this role",
    "the role",
    "position overview",
    "you'd be helping",
    "you would be helping",
    "the kind of background",
    "what you'll do",
    "what you will do",
    "key responsibilities",
    "qualifications",
    "requirements",
    "bonus points",
  ];
  let start = -1;
  for (const marker of startMarkers) {
    const idx = lower.indexOf(marker);
    if (idx >= 0 && (start < 0 || idx < start)) {
      start = idx;
    }
  }
  if (start > 0) {
    text = text.slice(start);
  }

  const stopPatterns = [
    /\n\s*Exclusive Job Seeker Insights\b/i,
    /\n\s*About the company\b/i,
    /\n\s*Set job alert for\b/i,
    /\n\s*Are these results helpful\b/i,
    /\n\s*\d+\s*results\b/i,
    /\n\s*Candidates who clicked apply\b/i,
    /\n\s*See how you compare\b/i,
    /\n\s*Promoted\b.*\n\s*Apply\b/i,
  ];
  for (const pattern of stopPatterns) {
    const match = text.match(pattern);
    if (match?.index !== undefined && match.index > 150) {
      text = text.slice(0, match.index).trim();
    }
  }

  if (text.length > 14_000) {
    const qualIdx = text.search(
      /\b(qualifications|requirements|what you need|must have|key responsibilities|what you.?ll do|background likely to fit|bonus points)\b/i,
    );
    if (qualIdx > 0) {
      text = text.slice(Math.max(0, qualIdx - 120), qualIdx + 12_000);
    } else {
      text = text.slice(0, 14_000);
    }
  }

  return text.trim();
}

/**
 * Pick the best JD text for SpaCy: focused LinkedIn slice, or full highlight when
 * focus would drop technologies (common with informal / pasted JDs).
 */
export function jobDescriptionForAnalysis(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  const focused = focusJobDescription(trimmed);

  if (!focused || focused.length < 40) {
    return trimmed.slice(0, 50_000);
  }

  if (hasTechSignals(trimmed) && !hasTechSignals(focused)) {
    return trimmed.slice(0, 50_000);
  }

  if (INFORMAL_JD_START.test(trimmed) && trimmed.length < 20_000) {
    return trimmed;
  }

  if (focused.length < trimmed.length * 0.12 && hasTechSignals(trimmed)) {
    return trimmed.slice(0, 50_000);
  }

  return focused;
}
