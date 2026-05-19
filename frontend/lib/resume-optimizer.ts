import { spawn } from "child_process";
import path from "path";
import { callGemini } from "@/lib/gemini-client";
import {
  getLlmLayerUrl,
  llmLayerOptimizeContext,
} from "@/lib/llm-layer-client";
import { pickOptimizeContextGemini } from "@/lib/optimize-context-gemini";
import { getPythonCommand, SKILLS_SERVICE_DIR } from "@/lib/python-env";
import { readResumeText } from "@/lib/resume-text";

export type OptimizeMode = "missing" | "reframe";

export type OptimizeContext = {
  skill: string;
  resumeBullet: string;
  jdSentence: string;
  relatedBullets: string[];
  bulletMentionsSkill: boolean;
};

export type OptimizeResult = OptimizeContext & {
  optimizedBullet: string;
  mode: OptimizeMode;
};

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
          `Failed to start Python (${pythonCmd}). Run: npm run llm:setup — ${err.message}`,
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

export async function pickClusterOptimizeContext(
  resumePath: string,
  jobDescription: string,
  skills: string[],
): Promise<OptimizeContext> {
  if (skills.length === 0) {
    throw new Error("skills are required");
  }
  if (skills.length === 1) {
    return pickOptimizeContext(resumePath, jobDescription, skills[0]);
  }

  const contexts = await Promise.all(
    skills.map((skill) => pickOptimizeContext(resumePath, jobDescription, skill)),
  );

  const jdParts = [
    ...new Set(contexts.map((c) => c.jdSentence).filter(Boolean)),
  ];
  const relatedBullets = [
    ...new Set(contexts.flatMap((c) => c.relatedBullets)),
  ];

  return {
    skill: skills.join(", "),
    resumeBullet: contexts.find((c) => c.resumeBullet)?.resumeBullet ?? "",
    jdSentence: jdParts.join(" "),
    relatedBullets:
      relatedBullets.length > 0
        ? relatedBullets
        : contexts[0].resumeBullet
          ? [contexts[0].resumeBullet]
          : [],
    bulletMentionsSkill: contexts.some((c) => c.bulletMentionsSkill),
  };
}

function mapOptimizeContextResult(
  result: Record<string, unknown>,
  skill: string,
): OptimizeContext {

  const relatedRaw = result.relatedBullets;
  const relatedBullets = Array.isArray(relatedRaw)
    ? relatedRaw.map((b) => String(b).trim()).filter(Boolean)
    : [];

  const resumeBullet = String(result.resumeBullet ?? "").trim();

  return {
    skill: String(result.skill ?? skill),
    resumeBullet,
    jdSentence: String(result.jdSentence ?? "").trim(),
    relatedBullets:
      relatedBullets.length > 0
        ? relatedBullets
        : resumeBullet
          ? [resumeBullet]
          : [],
    bulletMentionsSkill: Boolean(result.bulletMentionsSkill),
  };
}

async function pickOptimizeContextPython(
  resumePath: string,
  jobDescription: string,
  skill: string,
): Promise<OptimizeContext> {
  const resumeText = await readResumeText(resumePath);
  const result = await runPythonScript("optimize_context.py", {
    resumeText,
    jobDescription,
    skill,
  });
  return mapOptimizeContextResult(result, skill);
}

async function pickOptimizeContextLlmLayer(
  resumePath: string,
  jobDescription: string,
  skill: string,
): Promise<OptimizeContext> {
  const resumeText = await readResumeText(resumePath);
  const result = await llmLayerOptimizeContext(
    resumeText,
    jobDescription,
    skill,
  );
  return mapOptimizeContextResult(result, skill);
}

export async function pickOptimizeContext(
  resumePath: string,
  jobDescription: string,
  skill: string,
): Promise<OptimizeContext> {
  if (getLlmLayerUrl()) {
    return pickOptimizeContextLlmLayer(resumePath, jobDescription, skill);
  }

  if (process.env.VERCEL) {
    const resumeText = await readResumeText(resumePath);
    return pickOptimizeContextGemini(resumeText, jobDescription, skill);
  }

  try {
    return await pickOptimizeContextPython(resumePath, jobDescription, skill);
  } catch (pythonError) {
    try {
      const resumeText = await readResumeText(resumePath);
      return pickOptimizeContextGemini(resumeText, jobDescription, skill);
    } catch {
      throw pythonError;
    }
  }
}

function buildReframePrompt(ctx: OptimizeContext): string {
  return [
    `TARGET SKILL: ${ctx.skill}`,
    "",
    "CURRENT RESUME BULLET:",
    ctx.resumeBullet || "(none found)",
    "",
    "JOB DESCRIPTION SENTENCE:",
    ctx.jdSentence || "(none found)",
    "",
    `Rewrite this bullet so it clearly demonstrates ${ctx.skill} in the way the job description expects.`,
    "Keep the same scope of work — do not invent employers, dates, or metrics that are not implied.",
    "",
    "Requirements for the output:",
    "- One complete resume bullet (1–2 lines)",
    "- Start with a strong past-tense action verb",
    "- Ready to paste into a resume",
    "- Return ONLY the bullet text (no quotes, labels, or markdown)",
  ].join("\n");
}

function stripModelPreamble(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```[\w]*\n?|```$/g, "").trim();
  cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, "");

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-•*]\s+/, ""));

  const bulletish = lines.filter(
    (line) =>
      line.length >= 24 &&
      !/^(here is|here's|sure|certainly|note:)/i.test(line),
  );

  if (bulletish.length > 0) {
    return bulletish[0];
  }

  if (lines.length > 0) {
    return lines[lines.length - 1];
  }

  return cleaned.replace(/^[-•*]\s+/, "");
}

const REFRAME_SYSTEM =
  "You are an expert resume writer. Rewrite bullets to match job descriptions while staying truthful.";

export async function optimizeResumeBullet(
  resumePath: string,
  jobDescription: string,
  skill: string,
  options: { mode?: OptimizeMode; neededFor?: string } = {},
): Promise<OptimizeResult> {
  const ctx = await pickOptimizeContext(resumePath, jobDescription, skill);
  const mode: OptimizeMode = options.mode ?? "reframe";

  if (mode === "missing") {
    throw new Error(
      "Use the project workflow to build missing skills before generating a bullet.",
    );
  }

  const raw = await callGemini({
    systemInstruction: REFRAME_SYSTEM,
    userPrompt: buildReframePrompt(ctx),
    maxOutputTokens: 512,
    temperature: 0.4,
  });

  const optimizedBullet = stripModelPreamble(raw);
  if (!optimizedBullet || optimizedBullet.length < 20) {
    throw new Error(
      "Could not generate a complete resume bullet. Try again or pick another skill.",
    );
  }

  return { ...ctx, optimizedBullet, mode };
}
