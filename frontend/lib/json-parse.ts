/** Best-effort JSON parse for model output (handles fences, truncation, and minor issues). */
export function parseJsonFromModel<T>(raw: string): T {
  const candidates = collectJsonCandidates(raw);

  let lastError: Error | null = null;
  for (const candidate of candidates) {
    for (const attempt of buildParseAttempts(candidate)) {
      try {
        return JSON.parse(attempt) as T;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }
  }

  throw lastError ?? new Error("Could not parse JSON from model response");
}

function collectJsonCandidates(raw: string): string[] {
  const stripped = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t && !out.includes(t)) out.push(t);
  };

  push(stripped);
  push(extractBalancedJson(stripped) ?? "");

  const arrayMatch = stripped.match(/\[[\s\S]*\]/);
  if (arrayMatch) push(arrayMatch[0]);

  return out.filter(Boolean);
}

function extractBalancedJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return text.slice(start);
}

/** Remove trailing commas before `}` or `]` (common in model JSON). */
function stripTrailingCommas(input: string): string {
  return input.replace(/,(\s*[}\]])/g, "$1");
}

function buildParseAttempts(input: string): string[] {
  const attempts: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t && !attempts.includes(t)) attempts.push(t);
  };

  push(input);
  push(stripTrailingCommas(input));
  push(repairUnescapedQuotes(input));
  push(stripTrailingCommas(repairUnescapedQuotes(input)));
  push(repairNewlinesInStrings(input));
  push(repairUnescapedQuotes(repairNewlinesInStrings(input)));
  push(closeTruncatedJson(input));
  push(closeTruncatedJson(repairUnescapedQuotes(input)));
  push(closeTruncatedJson(repairNewlinesInStrings(input)));
  push(
    closeTruncatedJson(
      repairUnescapedQuotes(repairNewlinesInStrings(input)),
    ),
  );

  return attempts;
}

/** Escape raw newlines/tabs inside JSON string values. */
function repairNewlinesInStrings(input: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (!inString) {
      out += ch;
      if (ch === '"') {
        inString = true;
        escaped = false;
      }
      continue;
    }

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      out += ch;
      inString = false;
      continue;
    }

    if (ch === "\n") {
      out += "\\n";
      continue;
    }
    if (ch === "\r") {
      out += "\\r";
      continue;
    }
    if (ch === "\t") {
      out += "\\t";
      continue;
    }

    out += ch;
  }

  if (inString) out += '"';
  return out;
}

/**
 * When a `"` appears inside a string value, escape it unless it likely ends the string.
 */
function repairUnescapedQuotes(input: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (!inString) {
      out += ch;
      if (ch === '"') {
        inString = true;
        escaped = false;
      }
      continue;
    }

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      const rest = input.slice(i + 1);
      const next = rest.match(/^\s*(.)/)?.[1];
      if (next && ![",", "}", "]", ":"].includes(next)) {
        out += '\\"';
        continue;
      }
      out += ch;
      inString = false;
      continue;
    }

    if (ch === "\n") {
      out += "\\n";
      continue;
    }
    if (ch === "\r") {
      out += "\\r";
      continue;
    }
    if (ch === "\t") {
      out += "\\t";
      continue;
    }

    out += ch;
  }

  if (inString) out += '"';
  return out;
}

/** Close truncated JSON (unterminated string / missing brackets). */
function closeTruncatedJson(input: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        out += ch;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        out += ch;
        continue;
      }
      if (ch === '"') inString = false;
      out += ch;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      if (stack.length && stack[stack.length - 1] === ch) stack.pop();
    }

    out += ch;
  }

  if (inString) out += '"';
  while (stack.length) out += stack.pop();
  return out;
}
