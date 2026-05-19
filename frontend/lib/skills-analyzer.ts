import { spawn } from "child_process";
import path from "path";
import type { GapAnalysis } from "@/lib/gap-analysis-types";
import { normalizeGapAnalysis } from "@/lib/gap-analysis-normalize";
import { runGeminiGapAnalysis } from "@/lib/gap-analysis-gemini";
import type { GapAnalysisEngine } from "@/lib/gap-types";
import { focusJobDescription } from "@/lib/job-description";
import { getLlmLayerUrl, llmLayerGapAnalyze } from "@/lib/llm-layer-client";
import {
  canSpawnLocalPython,
  getPythonCommand,
  llmLayerSetupHint,
  SKILLS_SERVICE_DIR,
} from "@/lib/python-env";
import { readResumeText } from "@/lib/resume-text";

export type { GapAnalysisEngine } from "@/lib/gap-types";

export type GapAnalysisRunResult = GapAnalysis & {
  analysisEngine: GapAnalysisEngine;
};

export type {
  ContextMismatchDetail,
  GapAnalysis,
  MissingSkillInsight,
  SkillContextSnapshot,
} from "@/lib/gap-analysis-types";

const ANALYZE_SCRIPT = path.join(SKILLS_SERVICE_DIR, "analyze.py");

function hasGeminiKey(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim() ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim(),
  );
}

async function runGeminiGapAnalysisRun(
  resumePath: string,
  jobDescription: string,
  userId?: string,
): Promise<GapAnalysisRunResult> {
  const resumeText = await readResumeText(resumePath, userId);
  const analysis = await runGeminiGapAnalysis(resumeText, jobDescription);
  return { ...analysis, analysisEngine: "gemini" };
}

async function runPythonGapAnalysis(
  resumePath: string,
  jobDescription: string,
  userId?: string,
): Promise<GapAnalysis> {
  if (!canSpawnLocalPython()) {
    throw new Error(
      process.env.VERCEL
        ? "LLM_LAYER_URL is not set on Vercel. Add your Railway URL in Project → Settings → Environment Variables."
        : llmLayerSetupHint(),
    );
  }

  const resumeText = await readResumeText(resumePath, userId);
  const payload = JSON.stringify({
    resumeText,
    jobDescription,
  });

  const pythonCmd = getPythonCommand();

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCmd, [ANALYZE_SCRIPT], {
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
        reject(
          new Error(
            stderr.trim() ||
              `Skills analysis failed (exit ${code ?? "unknown"})`,
          ),
        );
        return;
      }

      try {
        const parsed = JSON.parse(trimmed) as GapAnalysis & { error?: string };
        if (parsed.error) {
          reject(new Error(parsed.error));
          return;
        }
        if (code !== 0) {
          reject(new Error(parsed.error || `Analysis exited with ${code}`));
          return;
        }
        resolve(normalizeGapAnalysis(parsed, jobDescription));
      } catch {
        reject(new Error(stderr.trim() || "Invalid analysis output"));
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}

async function runLlmLayerGapAnalysis(
  resumePath: string,
  jobDescription: string,
  userId?: string,
): Promise<GapAnalysisRunResult> {
  const resumeText = await readResumeText(resumePath, userId);
  const result = await llmLayerGapAnalyze(resumeText, jobDescription);
  return {
    ...normalizeGapAnalysis(result as Partial<GapAnalysis>, jobDescription),
    analysisEngine: "spacy",
  };
}

export async function runGapAnalysis(
  resumePath: string,
  jobDescription: string,
  userId?: string,
): Promise<GapAnalysisRunResult> {
  const focusedJd = focusJobDescription(jobDescription);
  const llmUrl = getLlmLayerUrl();

  // Production: Railway SpaCy via HTTP (never spawn python on Vercel).
  if (llmUrl) {
    return runLlmLayerGapAnalysis(resumePath, focusedJd, userId);
  }

  if (process.env.VERCEL) {
    if (hasGeminiKey()) {
      return runGeminiGapAnalysisRun(resumePath, focusedJd, userId);
    }
    throw new Error(
      "LLM_LAYER_URL is not set on Vercel. Add your Railway service URL and LLM_LAYER_SECRET in Environment Variables.",
    );
  }

  // Local: prefer LLM layer; fall back to venv Python, then Gemini.
  if (!canSpawnLocalPython()) {
    if (hasGeminiKey()) {
      return runGeminiGapAnalysisRun(resumePath, focusedJd, userId);
    }
    throw new Error(llmLayerSetupHint());
  }

  try {
    const analysis = await runPythonGapAnalysis(resumePath, focusedJd, userId);
    return { ...analysis, analysisEngine: "python-local" };
  } catch (pythonError) {
    if (hasGeminiKey()) {
      return runGeminiGapAnalysisRun(resumePath, focusedJd, userId);
    }
    throw pythonError;
  }
}
