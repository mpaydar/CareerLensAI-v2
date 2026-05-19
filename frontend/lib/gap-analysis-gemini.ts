import type { GapAnalysis } from "@/lib/gap-analysis-types";
import { normalizeGapAnalysis } from "@/lib/gap-analysis-normalize";
import { callGemini } from "@/lib/gemini-client";
import { parseJsonFromModel } from "@/lib/json-parse";

const GAP_SYSTEM = `You are an expert technical recruiter and resume analyst.
Compare resume skills to job description skills. Return ONLY valid JSON matching the requested schema.
Use concise skill names (e.g. "Python", "AWS", "SQL", "Spark").
For missing skills, include a short neededFor explanation.`;

export async function runGeminiGapAnalysis(
  resumeText: string,
  jobDescription: string,
): Promise<GapAnalysis> {
  if (resumeText.trim().length < 20) {
    throw new Error("could not extract enough text from resume file");
  }

  const userPrompt = [
    "Analyze skill gap between RESUME and JOB DESCRIPTION.",
    "",
    "RESUME TEXT:",
    resumeText.slice(0, 24_000),
    "",
    "JOB DESCRIPTION:",
    jobDescription.slice(0, 12_000),
    "",
    `Return JSON with keys:
- resumeSkills (string[])
- jobSkills (string[])
- matched (string[])
- missing (string[])
- extra (string[])
- matchPercent (number 0-100)
- contextMatchPercent (number 0-100)
- contextAligned (string[] subset of matched)
- contextMismatch (string[] subset of matched)
- missingInsights: [{ skill, neededFor, jdContext: { primarySentence, environmentTags, actionVerbs } }]
- contextMismatchDetails: [{ skill, alignmentScore, insight, jdContext, resumeContext }]
- noJobSkillsDetected (boolean)`,
  ].join("\n");

  const raw = await callGemini({
    systemInstruction: GAP_SYSTEM,
    userPrompt,
    jsonMode: true,
    maxOutputTokens: 4096,
    temperature: 0.2,
  });

  const parsed = parseJsonFromModel<Partial<GapAnalysis>>(raw);
  return normalizeGapAnalysis(parsed, jobDescription);
}
