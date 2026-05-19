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

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: Record<string, unknown> = {};
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { error: text };
    }
  }

  if (!res.ok) {
    const detail =
      typeof body.detail === "string"
        ? body.detail
        : typeof body.error === "string"
          ? body.error
          : `LLM layer error (${res.status})`;
    throw new Error(detail);
  }

  if (body.error) {
    throw new Error(String(body.error));
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
