import { spawn } from "child_process";
import path from "path";
import type { GapAnalysis } from "@/lib/gap-analysis-types";
import { normalizeGapAnalysis } from "@/lib/gap-analysis-normalize";
import type { GapAnalysisEngine } from "@/lib/gap-types";
import { jobDescriptionForAnalysis } from "@/lib/job-description";
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

function requireLlmLayerMessage(): string {
  if (process.env.VERCEL) {
    return [
      "Skills gap analysis uses SpaCy on the LLM layer (Railway), not Gemini.",
      "In Vercel → Settings → Environment Variables, set:",
      "  LLM_LAYER_URL = https://your-app.up.railway.app",
      "  LLM_LAYER_SECRET = (same value as Railway)",
      "Redeploy Vercel after saving.",
    ].join(" ");
  }
  return llmLayerSetupHint();
}

async function runPythonGapAnalysis(
  resumePath: string,
  jobDescription: string,
  userId?: string,
): Promise<GapAnalysis> {
  if (!canSpawnLocalPython()) {
    throw new Error(requireLlmLayerMessage());
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

/**
 * Skills gap = SpaCy only (keyword + context), via Railway locally or in prod.
 * Gemini is not used here — only resume optimize / project bullets use Gemini.
 */
export async function runGapAnalysis(
  resumePath: string,
  jobDescription: string,
  userId?: string,
): Promise<GapAnalysisRunResult> {
  const focusedJd = jobDescriptionForAnalysis(jobDescription);
  const llmUrl = getLlmLayerUrl();

  if (llmUrl) {
    return runLlmLayerGapAnalysis(resumePath, focusedJd, userId);
  }

  if (process.env.VERCEL) {
    throw new Error(requireLlmLayerMessage());
  }

  if (canSpawnLocalPython()) {
    const analysis = await runPythonGapAnalysis(resumePath, focusedJd, userId);
    return { ...analysis, analysisEngine: "python-local" };
  }

  throw new Error(requireLlmLayerMessage());
}
