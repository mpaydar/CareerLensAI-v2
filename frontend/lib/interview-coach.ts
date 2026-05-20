import { readFile } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import type { InterviewPlanResponse } from "@/lib/interview-types";
import {
  getLlmLayerUrl,
  llmLayerInterviewPlan,
  llmLayerTranscribe,
} from "@/lib/llm-layer-client";
import { isAzureSpeechConfigured, transcribeWithAzureSpeech } from "@/lib/azure-speech";
import {
  canSpawnLocalPython,
  getPythonCommand,
  llmLayerSetupHint,
  SKILLS_SERVICE_DIR,
} from "@/lib/python-env";

function requireLlmLayerMessage(): string {
  if (process.env.VERCEL) {
    return [
      "Interview questions use the LLM layer (Azure/Railway). Voice uses Azure Speech or the LLM layer.",
      "Set LLM_LAYER_URL + LLM_LAYER_SECRET for gap/questions, and AZURE_SPEECH_KEY + AZURE_SPEECH_REGION for voice.",
    ].join(" ");
  }
  return llmLayerSetupHint();
}

function requireTranscribeMessage(): string {
  if (isAzureSpeechConfigured()) {
    return "";
  }
  if (getLlmLayerUrl()) {
    return "";
  }
  if (canSpawnLocalPython()) {
    return "";
  }
  if (process.env.VERCEL) {
    return [
      "Voice transcription is not configured.",
      "Add AZURE_SPEECH_KEY and AZURE_SPEECH_REGION on Vercel (Azure portal → Speech resource → Keys and endpoint),",
      "or set LLM_LAYER_URL to a host with Whisper (Railway/Docker).",
    ].join(" ");
  }
  return [
    llmLayerSetupHint(),
    "Or add AZURE_SPEECH_KEY and AZURE_SPEECH_REGION to frontend/.env.local for Azure Speech.",
  ].join(" ");
}

function runPythonScript(
  scriptName: string,
  payload: unknown,
): Promise<Record<string, unknown>> {
  const scriptPath = path.join(SKILLS_SERVICE_DIR, scriptName);
  const pythonCmd = getPythonCommand();

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCmd, [scriptPath], {
      cwd: SKILLS_SERVICE_DIR,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(
        new Error(
          `Failed to start Python (${pythonCmd}). ${llmLayerSetupHint()} (${err.message})`,
        ),
      );
    });

    child.on("close", (code) => {
      const trimmed = stdout.trim();
      if (!trimmed) {
        reject(new Error(stderr.trim() || `Script failed (exit ${code})`));
        return;
      }
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (parsed.error) {
          reject(new Error(String(parsed.error)));
          return;
        }
        if (code !== 0) {
          reject(new Error(String(parsed.error || `Exit ${code}`)));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error(stderr.trim() || "Invalid script output"));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

/** Interview questions from SpaCy/LLM layer — not Gemini. */
export async function generateInterviewPlan(
  gapSkills: string[],
): Promise<InterviewPlanResponse> {
  if (getLlmLayerUrl()) {
    const result = await llmLayerInterviewPlan(gapSkills);
    return result as InterviewPlanResponse;
  }

  if (canSpawnLocalPython()) {
    const result = await runPythonScript("interview_prep.py", { gapSkills });
    return result as InterviewPlanResponse;
  }

  throw new Error(requireLlmLayerMessage());
}

/** Voice → text: Azure Speech (preferred on Vercel), else LLM layer Whisper, else local Python. */
export async function transcribeAudioBuffer(
  buffer: Buffer,
  filename: string,
  model = "base",
): Promise<string> {
  if (isAzureSpeechConfigured()) {
    return transcribeWithAzureSpeech(buffer, filename);
  }

  if (getLlmLayerUrl()) {
    return llmLayerTranscribe(
      buffer,
      filename,
      process.env.WHISPER_MODEL || model,
    );
  }

  if (canSpawnLocalPython()) {
    const uploadDir = path.join(process.cwd(), ".interview-audio");
    const { mkdir, writeFile, unlink } = await import("fs/promises");
    await mkdir(uploadDir, { recursive: true });
    const tempPath = path.join(uploadDir, `clip-${Date.now()}-${filename}`);
    await writeFile(tempPath, buffer);
    try {
      const result = await runPythonScript("transcribe_audio.py", {
        audioPath: tempPath,
        model: process.env.WHISPER_MODEL || model,
      });
      return String(result.text ?? "");
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  }

  const hint = requireTranscribeMessage();
  throw new Error(hint || "Transcription is not configured.");
}

export async function transcribeAudioFile(
  audioPath: string,
  model = "base",
): Promise<string> {
  const buffer = await readFile(audioPath);
  const filename = path.basename(audioPath);
  return transcribeAudioBuffer(buffer, filename, model);
}

/** Score user answer vs ideal; voice mode earns more points. */
export function scoreAnswer(
  userAnswer: string,
  idealAnswer: string,
  mode: "voice" | "type",
): { points: number; maxPoints: number } {
  const maxPoints = mode === "voice" ? 100 : 65;
  const words = userAnswer.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return { points: 0, maxPoints };
  }

  const idealTokens = new Set(
    idealAnswer
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
  const userTokens = userAnswer
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  let overlap = 0;
  for (const token of userTokens) {
    if (idealTokens.has(token)) {
      overlap += 1;
    }
  }

  const overlapRatio = Math.min(1, overlap / Math.max(idealTokens.size * 0.15, 1));
  const lengthRatio = Math.min(1, words.length / 40);
  const raw = overlapRatio * 0.55 + lengthRatio * 0.45;
  const points = Math.round(maxPoints * raw);

  return { points: Math.max(mode === "voice" ? 10 : 5, points), maxPoints };
}
