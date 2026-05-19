export function getGeminiApiKey(): string {
  const key =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to -yes/.env.local (from Google AI Studio → API Keys).",
    );
  }
  return key;
}

export function getGeminiModel(): string {
  return (
    process.env.GEMINI_MODEL?.trim() ||
    process.env.GOOGLE_MODEL?.trim() ||
    "gemini-2.5-flash"
  );
}

type CallGeminiOptions = {
  systemInstruction: string;
  userPrompt: string;
  maxOutputTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  /** Gemini structured output schema (use with jsonMode). */
  responseSchema?: Record<string, unknown>;
};

export async function callGemini(options: CallGeminiOptions): Promise<string> {
  const apiKey = getGeminiApiKey();
  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: options.systemInstruction }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: options.userPrompt }],
        },
      ],
      generationConfig: {
        temperature: options.temperature ?? 0.45,
        maxOutputTokens: options.maxOutputTokens ?? 1024,
        ...(options.jsonMode
          ? {
              responseMimeType: "application/json",
              ...(options.responseSchema
                ? { responseSchema: options.responseSchema }
                : {}),
            }
          : {}),
      },
    }),
  });

  const rawBody = await response.text();
  let data: {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    error?: { message?: string };
  };
  try {
    data = JSON.parse(rawBody) as typeof data;
  } catch {
    throw new Error(
      `Gemini request failed (${response.status}): ${rawBody.slice(0, 200)}`,
    );
  }

  if (!response.ok) {
    const message = data.error?.message ?? rawBody.slice(0, 200);
    throw new Error(`Gemini request failed (${response.status}): ${message}`);
  }

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const raw = parts
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!raw) {
    throw new Error("Gemini returned an empty response");
  }

  return raw;
}

export { parseJsonFromModel } from "@/lib/json-parse";
