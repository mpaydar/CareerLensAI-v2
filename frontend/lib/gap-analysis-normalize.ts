import type {
  GapAnalysis,
  MissingSkillInsight,
} from "@/lib/gap-analysis-types";

function emptyContext() {
  return {
    environmentTags: [] as string[],
    actionVerbs: [] as string[],
    primarySentence: "",
    sampleSentences: [] as string[],
    rolePhrases: [] as string[],
  };
}

/** Normalize SpaCy / Gemini / Python gap JSON into a consistent dashboard shape. */
export function normalizeGapAnalysis(
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

  const missingInsights: MissingSkillInsight[] = Array.isArray(
    raw.missingInsights,
  )
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
            neededFor:
              neededFor ||
              "Required for this role per the job description.",
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
        neededFor:
          "Listed in the job description; not found on your resume.",
        jdContext: {
          ...emptyContext(),
          primarySentence: jobDescription.slice(0, 200),
        },
      }));

  const contextMismatchDetails = Array.isArray(raw.contextMismatchDetails)
    ? raw.contextMismatchDetails
    : [];

  const summaryRaw = raw.summary;
  const summary = {
    resumeSkillCount:
      typeof summaryRaw?.resumeSkillCount === "number"
        ? summaryRaw.resumeSkillCount
        : resumeSkills.length,
    jobSkillCount:
      typeof summaryRaw?.jobSkillCount === "number"
        ? summaryRaw.jobSkillCount
        : jdCount,
    matchedCount:
      typeof summaryRaw?.matchedCount === "number"
        ? summaryRaw.matchedCount
        : matched.length,
    missingCount:
      typeof summaryRaw?.missingCount === "number"
        ? summaryRaw.missingCount
        : missing.length,
    extraCount:
      typeof summaryRaw?.extraCount === "number"
        ? summaryRaw.extraCount
        : extra.length,
    contextAlignedCount:
      typeof summaryRaw?.contextAlignedCount === "number"
        ? summaryRaw.contextAlignedCount
        : contextAligned.length,
    contextMismatchCount:
      typeof summaryRaw?.contextMismatchCount === "number"
        ? summaryRaw.contextMismatchCount
        : contextMismatch.length,
  };

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
    summary,
    analyzedAt:
      typeof raw.analyzedAt === "string" && raw.analyzedAt
        ? raw.analyzedAt
        : new Date().toISOString(),
    noJobSkillsDetected: Boolean(raw.noJobSkillsDetected) || jdCount === 0,
  };
}
