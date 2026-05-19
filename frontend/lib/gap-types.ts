import type { GapAnalysis } from "@/lib/gap-analysis-types";

export type StoredGapAnalysis = GapAnalysis & {
  jobDescriptionPreview: string;
  resumeFileName: string;
};
