export type SkillContextSnapshot = {
  environmentTags: string[];
  actionVerbs: string[];
  primarySentence: string;
  sampleSentences: string[];
  rolePhrases: string[];
};

export type ContextMismatchDetail = {
  skill: string;
  alignmentScore: number;
  jdContext: SkillContextSnapshot;
  resumeContext: SkillContextSnapshot;
  insight: string;
};

export type MissingSkillInsight = {
  skill: string;
  jdContext: SkillContextSnapshot;
  neededFor: string;
};

export type GapAnalysis = {
  resumeSkills: string[];
  jobSkills: string[];
  matched: string[];
  missing: string[];
  extra: string[];
  matchPercent: number;
  contextMatchPercent: number;
  contextAligned: string[];
  contextMismatch: string[];
  contextMismatchDetails: ContextMismatchDetail[];
  missingInsights: MissingSkillInsight[];
  summary: {
    resumeSkillCount: number;
    jobSkillCount: number;
    matchedCount: number;
    missingCount: number;
    extraCount: number;
    contextAlignedCount: number;
    contextMismatchCount: number;
  };
  analyzedAt: string;
  noJobSkillsDetected?: boolean;
};
