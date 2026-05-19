import type { GapAnalysis } from "@/lib/gap-analysis-types";

export type GapAnalysisEngine = "spacy" | "python-local";

export type StoredGapAnalysis = GapAnalysis & {
  jobDescriptionPreview: string;
  resumeFileName: string;
  analysisEngine?: GapAnalysisEngine;
};
