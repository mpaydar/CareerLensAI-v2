import { getHighlightForSession } from "@/lib/highlight-scope";
import { ensureResumeFilePath, getResumeMeta } from "@/lib/resume-upload";
import type { SkillClusterKind } from "@/lib/skill-clusters";
import type { User } from "@/lib/user-store";

export type ProjectRequestContext = {
  skill: string;
  skills: string[];
  clusterLabel?: string;
  clusterKind?: SkillClusterKind;
  neededFor?: string;
  resumePath: string;
  jobDescription: string;
};

export async function resolveProjectRequest(
  user: User,
  skillOrSkills: string | string[],
  neededFor?: string,
  options?: {
    clusterLabel?: string;
    clusterKind?: SkillClusterKind;
  },
): Promise<ProjectRequestContext> {
  const skills = (Array.isArray(skillOrSkills) ? skillOrSkills : [skillOrSkills])
    .map((s) => s.trim())
    .filter(Boolean);

  if (skills.length === 0) {
    throw new Error("at least one skill is required");
  }

  const resumeMeta = await getResumeMeta(user.id);
  if (!resumeMeta) {
    throw new Error("upload a resume first");
  }

  const highlight = await getHighlightForSession();
  const jobDescription = highlight.text.trim();
  if (jobDescription.length < 20) {
    throw new Error("highlight a job description first");
  }

  const clusterLabel = options?.clusterLabel?.trim();
  const skill =
    clusterLabel ||
    (skills.length === 1 ? skills[0] : skills.join(", "));

  return {
    skill,
    skills,
    clusterLabel,
    clusterKind: options?.clusterKind,
    neededFor: neededFor?.trim() || undefined,
    resumePath: await ensureResumeFilePath(user.id, resumeMeta),
    jobDescription,
  };
}
