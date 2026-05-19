import type { GapAnalysis, MissingSkillInsight } from "@/lib/gap-analysis-types";
import { callGemini } from "@/lib/gemini-client";
import { parseJsonFromModel } from "@/lib/json-parse";

const GAP_SYSTEM = `You are an expert technical recruiter and resume analyst.
Compare resume skills to job description skills. Return ONLY valid JSON matching the requested schema.
Use concise skill names (e.g. "Python", "AWS", "SQL", "Spark").
For missing skills, include a short neededFor explanation.`;

function emptyContext() {
  return {
    environmentTags: [] as string[],
    actionVerbs: [] as string[],
    primarySentence: "",
    sampleSentences: [] as string[],
    rolePhrases: [] as string[],
  };
}

function normalizeGapAnalysis(
  raw: Partial<GapAnalysis>,
  jobDescription: string,
): GapAnalysis {
  const resumeSkills = Array.isArray(raw.resumeSkills)
    ? raw.resumeSkills.map(String).filter(Boolean)
    : [];
  const jobSkills = Array.isArray(raw.jobSkills)
    ? raw.jobSkills.map(String).filter(Boolean)
    : [];
  const matched = Array.isArray(raw.matched)
    ? raw.matched.map(String).filter(Boolean)
    : [];
  const missing = Array.isArray(raw.missing)
    ? raw.missing.map(String).filter(Boolean)
    : [];
  const extra = Array.isArray(raw.extra)
    ? raw.extra.map(String).filter(Boolean)
    : [];
  const contextAligned = Array.isArray(raw.contextAligned)
    ? raw.contextAligned.map(String).filter(Boolean)
    : [];
  const contextMismatch = Array.isArray(raw.contextMismatch)
    ? raw.contextMismatch.map(String).filter(Boolean)
    : [];

  const jdCount = jobSkills.length;
  const matchPercent =
    typeof raw.matchPercent === "number"
      ? Math.round(raw.matchPercent)
      : jdCount
        ? Math.round((matched.length / jdCount) * 100)
        : 0;

  const contextMatchPercent =
    typeof raw.contextMatchPercent === "number"
      ? Math.round(raw.contextMatchPercent)
      : matched.length
        ? Math.round((contextAligned.length / matched.length) * 100)
        : 0;

  const missingInsights: MissingSkillInsight[] = Array.isArray(raw.missingInsights)
    ? raw.missingInsights
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const skill = String((item as MissingSkillInsight).skill ?? "").trim();
          const neededFor = String(
            (item as MissingSkillInsight).neededFor ?? "",
          ).trim();
          const jdContext =
            (item as MissingSkillInsight).jdContext ?? emptyContext();
          return {
            skill,
            neededFor: neededFor || `Required for this role per the job description.`,
            jdContext: {
              ...emptyContext(),
              ...jdContext,
              primarySentence:
                jdContext.primarySentence ||
                jobDescription.slice(0, 200),
            },
          };
        })
        .filter((item) => item.skill)
    : missing.map((skill) => ({
        skill,
        neededFor: `Listed in the job description; not found on your resume.`,
        jdContext: {
          ...emptyContext(),
          primarySentence: jobDescription.slice(0, 200),
        },
      }));

  const contextMismatchDetails = Array.isArray(raw.contextMismatchDetails)
    ? raw.contextMismatchDetails
    : [];

  return {
    resumeSkills,
    jobSkills,
    matched,
    missing,
    extra,
    matchPercent,
    contextMatchPercent,
    contextAligned,
    contextMismatch,
    contextMismatchDetails,
    missingInsights,
    summary: {
      resumeSkillCount: resumeSkills.length,
      jobSkillCount: jdCount,
      matchedCount: matched.length,
      missingCount: missing.length,
      extraCount: extra.length,
      contextAlignedCount: contextAligned.length,
      contextMismatchCount: contextMismatch.length,
    },
    analyzedAt: new Date().toISOString(),
    noJobSkillsDetected: Boolean(raw.noJobSkillsDetected) || jdCount === 0,
  };
}

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
