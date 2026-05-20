/** HTTP client for the Railway-hosted Python LLM layer. */

export function getLlmLayerUrl(): string | null {
  const raw = process.env.LLM_LAYER_URL?.trim();
  if (!raw) {
    return null;
  }
  return raw.replace(/\/$/, "");
}

function authHeaders(): Record<string, string> {
  const secret = process.env.LLM_LAYER_SECRET?.trim();
  if (!secret) {
    return {};
  }
  return { Authorization: `Bearer ${secret}` };
}

function isHtmlErrorPayload(text: string): boolean {
  const sample = text.trim().slice(0, 400).toLowerCase();
  return (
    sample.startsWith("<!doctype html") ||
    sample.startsWith("<html") ||
    sample.includes("application error") ||
    sample.includes("<head>")
  );
}

function isCloudRunPlaceholderPage(text: string): boolean {
  const sample = text.toLowerCase();
  return (
    sample.includes("placeholder | cloud run") ||
    sample.includes("cloud run</title>") ||
    (sample.includes("cloud run") && sample.includes("placeholder"))
  );
}

function friendlyLlmLayerError(
  status: number,
  raw: string,
  base: string,
): string {
  if (isHtmlErrorPayload(raw)) {
    if (isCloudRunPlaceholderPage(raw)) {
      return [
        `LLM layer at ${base} is still the default Cloud Run placeholder, not your FastAPI app.`,
        "Redeploy from the llm_layer folder (buildpack or Dockerfile), source directory llm_layer — not the sample container.",
        `Then open ${base}/health — you should see JSON with "spacy":"ok", not an HTML page.`,
      ].join(" ");
    }
    if (base.includes("azurewebsites.net")) {
      return [
        `LLM layer at ${base} returned an HTML error page (HTTP ${status}), not JSON.`,
        "The Azure App Service app is likely stopped or misconfigured.",
        `Open ${base}/health — you should see JSON with "spacy":"ok".`,
        "Azure → snapResume → Startup Command: bash startup.sh, then Restart.",
      ].join(" ");
    }
    return [
      `LLM layer at ${base} returned an HTML page (HTTP ${status}), not JSON.`,
      `Open ${base}/health — you should see JSON with "spacy":"ok".`,
      "Check Cloud Run logs: the container may have crashed or the wrong image was deployed.",
    ].join(" ");
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return `LLM layer error (HTTP ${status})`;
  }
  if (trimmed.length > 320) {
    return `${trimmed.slice(0, 320)}…`;
  }
  return trimmed;
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const base = getLlmLayerUrl() ?? "LLM layer";
  const text = await res.text();
  let body: Record<string, unknown> = {};
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      if (!res.ok || isHtmlErrorPayload(text)) {
        throw new Error(friendlyLlmLayerError(res.status, text, base));
      }
      body = { error: text };
    }
  }

  if (!res.ok) {
    const raw =
      typeof body.detail === "string"
        ? body.detail
        : typeof body.error === "string"
          ? body.error
          : text;
    throw new Error(friendlyLlmLayerError(res.status, raw, base));
  }

  if (body.error) {
    const errText = String(body.error);
    if (isHtmlErrorPayload(errText)) {
      throw new Error(friendlyLlmLayerError(res.status, errText, base));
    }
    throw new Error(errText);
  }

  return body as T;
}

async function llmLayerFetch(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const base = getLlmLayerUrl();
  if (!base) {
    throw new Error(
      "LLM_LAYER_URL is not configured. Add it to frontend/.env.local (e.g. http://localhost:8000).",
    );
  }

  try {
    return await fetch(`${base}${path}`, init);
  } catch (cause) {
    const hint =
      base.includes("localhost") || base.includes("127.0.0.1")
        ? " Start the LLM layer: cd llm_layer && source .venv/bin/activate && python -m uvicorn app.main:app --reload --port 8000"
        : "";
    const message =
      cause instanceof Error ? cause.message : "connection failed";
    throw new Error(`LLM layer unreachable at ${base} (${message}).${hint}`);
  }
}

export async function llmLayerGapAnalyze(
  resumeText: string,
  jobDescription: string,
): Promise<Record<string, unknown>> {
  const res = await llmLayerFetch("/gap/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ resumeText, jobDescription }),
  });

  return parseJsonResponse(res);
}

export async function llmLayerOptimizeContext(
  resumeText: string,
  jobDescription: string,
  skill: string,
): Promise<Record<string, unknown>> {
  const res = await llmLayerFetch("/optimize/context", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ resumeText, jobDescription, skill }),
  });

  return parseJsonResponse(res);
}

export async function llmLayerInterviewPlan(
  gapSkills: string[],
): Promise<Record<string, unknown>> {
  const res = await llmLayerFetch("/interview/plan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ gapSkills }),
  });

  return parseJsonResponse(res);
}

export async function llmLayerTranscribe(
  audioBuffer: Buffer,
  filename: string,
  model?: string,
): Promise<string> {
  const form = new FormData();
  const file = new File([new Uint8Array(audioBuffer)], filename);
  form.append("file", file);
  if (model) {
    form.append("model", model);
  }

  const res = await llmLayerFetch("/interview/transcribe", {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });

  const parsed = await parseJsonResponse<{ text?: string }>(res);
  return String(parsed.text ?? "");
}
