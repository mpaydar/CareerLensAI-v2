/**
 * Heuristic Easy Apply submit detection from LinkedIn click sequences.
 * Pattern: form fills (label/input/select) → … → button → span on a job URL.
 */
(function initEasyApplyDetector(global) {
  const WINDOW_SIZE = 12;
  const SESSION_MS = 10 * 60 * 1000;
  const DEDUPE_MS = 3 * 60 * 1000;

  /** @type {{ tag: string, ts: number, jobId: string, submitButton?: boolean }[]} */
  let buffer = [];
  /** @type {Record<string, number>} */
  let lastReportedByJob = {};

  function extractJobId(url) {
    try {
      const parsed = new URL(url);
      const fromQuery =
        parsed.searchParams.get("currentJobId") ||
        parsed.searchParams.get("jobId") ||
        parsed.searchParams.get("job_id");
      if (fromQuery) {
        return fromQuery;
      }
      const pathMatch = parsed.pathname.match(/\/jobs\/view\/(\d+)/i);
      return pathMatch ? pathMatch[1] : "";
    } catch {
      return "";
    }
  }

  function isJobContextUrl(url) {
    return (
      /linkedin\.com/i.test(url) &&
      (/currentJobId=/i.test(url) || /\/jobs\/view\//i.test(url))
    );
  }

  function getTag(target) {
    if (!target || !target.tagName) {
      return "unknown";
    }
    return target.tagName.toLowerCase();
  }

  function isLikelySubmitButton(target) {
    const button =
      target?.closest?.("button") ||
      (target?.tagName?.toLowerCase() === "button" ? target : null);
    if (!button) {
      return false;
    }
    const label = (
      button.innerText ||
      button.getAttribute("aria-label") ||
      ""
    )
      .trim()
      .toLowerCase();
    return /submit|review your application|done|next|apply|continue/.test(
      label,
    );
  }

  function detectSubmitPattern(entries) {
    if (entries.length < 5) {
      return false;
    }

    const tags = entries.map((e) => e.tag);
    const tail = tags.slice(-3);

    const endsWithButtonSpan =
      tail.length >= 2 &&
      tail[tail.length - 2] === "button" &&
      tail[tail.length - 1] === "span";

    if (!endsWithButtonSpan) {
      return false;
    }

    const body = tags.slice(0, -2);
    const formHits = body.filter(
      (t) => t === "label" || t === "input" || t === "select",
    ).length;

    if (formHits < 3) {
      return false;
    }

    const buttonEntry = entries[entries.length - 2];
    return Boolean(buttonEntry?.submitButton);
  }

  function resetBuffer() {
    buffer = [];
  }

  /**
   * @param {MouseEvent} event
   * @param {(payload: { jobId: string, sourceUrl: string, appliedAt: string }) => void} onDetected
   */
  function recordClick(event, onDetected) {
    const url = global.location.href;
    if (!isJobContextUrl(url)) {
      resetBuffer();
      return;
    }

    const jobId = extractJobId(url);
    if (!jobId) {
      return;
    }

    const now = Date.now();
    if (buffer.length && buffer[0].jobId !== jobId) {
      resetBuffer();
    }

    const tag = getTag(event.target);
    const submitButton =
      tag === "button" ? isLikelySubmitButton(event.target) : false;

    buffer.push({ tag, ts: now, jobId, submitButton });
    while (buffer.length > WINDOW_SIZE) {
      buffer.shift();
    }
    buffer = buffer.filter((entry) => now - entry.ts < SESSION_MS);

    if (!detectSubmitPattern(buffer)) {
      return;
    }

    const last = lastReportedByJob[jobId] || 0;
    if (now - last < DEDUPE_MS) {
      resetBuffer();
      return;
    }

    lastReportedByJob[jobId] = now;
    resetBuffer();

    onDetected({
      jobId,
      sourceUrl: url,
      appliedAt: new Date().toISOString(),
    });
  }

  global.ResumeSnapEasyApply = {
    recordClick,
    resetBuffer,
  };
})(typeof window !== "undefined" ? window : self);
