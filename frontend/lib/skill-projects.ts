import { callGemini } from "@/lib/gemini-client";
import { parseJsonFromModel } from "@/lib/json-parse";
import {
  parseProjectMetaFromLines,
  PROJECT_META_RESPONSE_SCHEMA,
} from "@/lib/project-meta-parse";
import {
  pickClusterOptimizeContext,
  type OptimizeContext,
} from "@/lib/resume-optimizer";
import type { SkillClusterKind } from "@/lib/skill-clusters";

export type ProjectClusterInput = {
  skills: string[];
  clusterLabel?: string;
  clusterKind?: SkillClusterKind;
  neededFor?: string;
};

function skillsCoverageLine(skills: string[]): string {
  if (skills.length <= 1) {
    return "Cover at least 70% of what the job needs for this skill.";
  }
  return [
    `This project must demonstrate EVERY skill in the gap cluster: ${skills.join(", ")}.`,
    "Each tool/language should appear in the build or README evidence, not only as a mention.",
  ].join(" ");
}

export type SkillProjectSuggestion = {
  id: string;
  title: string;
  summary: string;
  estimatedHours: number;
  gapCoveragePercent: number;
  buildsOn: string;
  deliverables: string[];
  instructionGuide: string;
};

export type ProjectMeta = Omit<SkillProjectSuggestion, "instructionGuide">;

export type ProjectSuggestionsResult = {
  skill: string;
  projects: SkillProjectSuggestion[];
  context: OptimizeContext;
};

export type ProjectMetaResult = {
  skill: string;
  projects: ProjectMeta[];
  context: OptimizeContext;
};

export type ProjectGuideResult = {
  skill: string;
  projectId: string;
  instructionGuide: string;
};

export type ProjectBulletResult = {
  skill: string;
  projectTitle: string;
  githubUrl: string;
  optimizedBullet: string;
  context: OptimizeContext;
};

function parseGithubRepo(url: string): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(url.trim());
    if (!parsed.hostname.includes("github.com")) {
      return null;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) {
      return null;
    }
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

export async function fetchGithubReadme(githubUrl: string): Promise<string> {
  const repo = parseGithubRepo(githubUrl);
  if (!repo) {
    throw new Error("Enter a valid public GitHub repo URL (github.com/owner/repo).");
  }

  const apiUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/readme`;
  const response = await fetch(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "ResumeSnap-Skill-Projects",
    },
    next: { revalidate: 0 },
  });

  if (response.status === 404) {
    return "";
  }

  if (!response.ok) {
    throw new Error(
      `Could not read repo README (${response.status}). Ensure the repository is public.`,
    );
  }

  const data = (await response.json()) as { content?: string; encoding?: string };
  if (!data.content || data.encoding !== "base64") {
    return "";
  }

  return Buffer.from(data.content, "base64").toString("utf8").slice(0, 12_000);
}

function normalizeMeta(
  raw: Partial<SkillProjectSuggestion>,
  index: number,
): ProjectMeta {
  return {
    id: raw.id || `project-${index + 1}`,
    title: String(raw.title ?? `Project ${index + 1}`).trim(),
    summary: String(raw.summary ?? "").trim(),
    estimatedHours: Math.min(8, Math.max(4, Number(raw.estimatedHours) || 6)),
    gapCoveragePercent: Math.min(
      100,
      Math.max(70, Number(raw.gapCoveragePercent) || 75),
    ),
    buildsOn: String(raw.buildsOn ?? "").trim(),
    deliverables: Array.isArray(raw.deliverables)
      ? raw.deliverables.map((d) => String(d).trim()).filter(Boolean)
      : ["Public GitHub repository", "README with setup and demo"],
  };
}

const PROJECT_ANGLES = [
  "API / backend service focus",
  "UI dashboard or interactive demo focus",
  "integration, automation, or data pipeline focus",
] as const;

async function suggestOneProjectMeta(
  ctx: OptimizeContext,
  jobDescription: string,
  input: ProjectClusterInput,
  index: number,
): Promise<ProjectMeta> {
  const { skills, neededFor, clusterLabel } = input;
  const experience = ctx.relatedBullets
    .map((b, i) => `${i + 1}. ${b}`)
    .join("\n");

  const angle = PROJECT_ANGLES[index] ?? PROJECT_ANGLES[0];
  const gapLabel = clusterLabel ?? skills.join(", ");

  const prompt = [
    `Design ONE portfolio project (project ${index + 1} of 3) to close resume skill gaps.`,
    `Angle for this project: ${angle}. Must differ from the other two angles.`,
    "",
    `GAP CLUSTER: ${gapLabel}`,
    `SKILLS TO COVER (all required): ${skills.join(", ")}`,
    skillsCoverageLine(skills),
    `JOB DESCRIPTION EXCERPT: ${ctx.jdSentence || jobDescription.slice(0, 500)}`,
    neededFor ? `WHY THE JOB CARES (per skill context):\n${neededFor}` : "",
    "",
    `CANDIDATE EXPERIENCE (anchor to this; do not invent employers):`,
    experience || ctx.resumeBullet || "(limited resume text)",
    "",
    "Rules:",
    "- Completable in 4–8 hours",
    "- gapCoveragePercent between 70 and 95",
    "- deliverables: 2–4 short items",
  ]
    .filter(Boolean)
    .join("\n");

  const linePrompt = [
    prompt,
    "",
    "If you cannot return JSON, use exactly this plain-text format instead:",
    "TITLE: short title",
    "SUMMARY: two short sentences on one or two lines",
    "HOURS: 6",
    "COVERAGE: 75",
    "BUILDS_ON: resume anchor",
    "DELIVERABLE: README",
    "DELIVERABLE: demo",
  ].join("\n");

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const useSchema = attempt < 2;
    const useLines = attempt === 2;

    try {
      const raw = await callGemini({
        systemInstruction: useLines
          ? "Reply using only the TITLE/SUMMARY/HOURS plain-text lines requested. No JSON, no markdown fences."
          : "Return one JSON object matching the schema. No markdown.",
        userPrompt: useLines ? linePrompt : prompt,
        maxOutputTokens: 1024,
        temperature: useLines ? 0.3 : attempt === 0 ? 0.4 : 0.2,
        jsonMode: useSchema,
        responseSchema: useSchema
          ? { ...PROJECT_META_RESPONSE_SCHEMA }
          : undefined,
      });

      if (useLines) {
        return parseProjectMetaFromLines(raw, index);
      }

      const parsed = parseJsonFromModel<Partial<SkillProjectSuggestion>>(raw);
      return normalizeMeta(parsed, index);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError ?? new Error(`Could not generate project ${index + 1}`);
}

export async function suggestProjectMeta(
  resumePath: string,
  jobDescription: string,
  input: ProjectClusterInput,
): Promise<ProjectMetaResult> {
  const skills = input.skills.filter(Boolean);
  const ctx = await pickClusterOptimizeContext(
    resumePath,
    jobDescription,
    skills,
  );

  const projects = await Promise.all(
    [0, 1, 2].map((i) =>
      suggestOneProjectMeta(ctx, jobDescription, input, i),
    ),
  );

  const skill =
    input.clusterLabel ?? (skills.length === 1 ? skills[0] : skills.join(", "));

  return { skill, projects, context: ctx };
}

export async function generateProjectGuide(
  resumePath: string,
  jobDescription: string,
  input: ProjectClusterInput,
  project: ProjectMeta,
): Promise<ProjectGuideResult> {
  const skills = input.skills.filter(Boolean);
  const ctx = await pickClusterOptimizeContext(
    resumePath,
    jobDescription,
    skills,
  );
  const gapLabel = input.clusterLabel ?? skills.join(", ");

  const prompt = [
    `Write a detailed instruction guide for this portfolio project.`,
    "",
    `GAP CLUSTER: ${gapLabel}`,
    `SKILLS TO COVER (all required): ${skills.join(", ")}`,
    skillsCoverageLine(skills),
    `JOB NEED: ${ctx.jdSentence || jobDescription.slice(0, 500)}`,
    input.neededFor ? `WHY THE JOB CARES:\n${input.neededFor}` : "",
    "",
    `PROJECT TITLE: ${project.title}`,
    `SUMMARY: ${project.summary}`,
    `BUILDS ON: ${project.buildsOn}`,
    `DELIVERABLES: ${project.deliverables.join(", ")}`,
    `TARGET TIME: ${project.estimatedHours} hours`,
    "",
    "Write markdown only (no JSON, no code fences wrapping the whole doc).",
    "",
    "Requirements:",
    "- ~3 pages (900–1200 words)",
    "- NO copy-paste code scripts or full source files — describe what to build and how to verify",
    `- ${skillsCoverageLine(skills)}`,
    "- Sections: # Objective, ## Prerequisites, ## Phase 1 (with time box), ## Phase 2, ## Phase 3, ## Verification checklist, ## What to publish on GitHub, ## How this maps to the job",
    "- Pure hands-on instructions tied to their background",
    "",
    "Return ONLY the markdown guide.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callGemini({
    systemInstruction:
      "You write clear, professional project instruction guides for job seekers. Output markdown only.",
    userPrompt: prompt,
    maxOutputTokens: 8192,
    temperature: 0.5,
  });

  const instructionGuide = raw
    .replace(/^```markdown\s*/i, "")
    .replace(/^```md\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  if (instructionGuide.length < 400) {
    throw new Error(
      `Instruction guide for "${project.title}" was too short. Try again.`,
    );
  }

  const skill =
    input.clusterLabel ?? (skills.length === 1 ? skills[0] : skills.join(", "));

  return { skill, projectId: project.id, instructionGuide };
}

export async function suggestSkillProjects(
  resumePath: string,
  jobDescription: string,
  input: ProjectClusterInput,
): Promise<ProjectSuggestionsResult> {
  const { projects: meta, context, skill: resolvedSkill } =
    await suggestProjectMeta(resumePath, jobDescription, input);

  const guides = await Promise.all(
    meta.map((project) =>
      generateProjectGuide(resumePath, jobDescription, input, project),
    ),
  );

  const guideById = new Map(guides.map((g) => [g.projectId, g.instructionGuide]));

  const projects: SkillProjectSuggestion[] = meta.map((project) => ({
    ...project,
    instructionGuide: guideById.get(project.id) ?? "",
  }));

  for (const project of projects) {
    if (project.instructionGuide.length < 400) {
      throw new Error(
        `Project "${project.title}" guide was too short. Regenerate.`,
      );
    }
  }

  return { skill: resolvedSkill, projects, context };
}

export async function generateBulletFromGithubProject(
  resumePath: string,
  jobDescription: string,
  input: ProjectClusterInput,
  project: SkillProjectSuggestion,
  githubUrl: string,
): Promise<ProjectBulletResult> {
  const skills = input.skills.filter(Boolean);
  const ctx = await pickClusterOptimizeContext(
    resumePath,
    jobDescription,
    skills,
  );
  const gapLabel = input.clusterLabel ?? skills.join(", ");
  const readme = await fetchGithubReadme(githubUrl);

  const prompt = [
    `The candidate completed a portfolio project to close these gaps: ${skills.join(", ")}.`,
    "",
    `PROJECT THEY COMPLETED: ${project.title}`,
    `PROJECT SUMMARY: ${project.summary}`,
    `GITHUB URL: ${githubUrl}`,
    "",
    readme
      ? `README EXCERPT:\n${readme.slice(0, 8000)}`
      : "README could not be fetched — write a bullet that references the repo URL and typical deliverables without inventing specific metrics.",
    "",
    `GAP CLUSTER: ${gapLabel}`,
    `JOB DESCRIPTION NEED: ${ctx.jdSentence}`,
    input.neededFor ? `GAP CONTEXT:\n${input.neededFor}` : "",
    "",
    `RELATED PRIOR EXPERIENCE:\n${ctx.relatedBullets.map((b) => `- ${b}`).join("\n")}`,
    "",
    "Write ONE resume bullet (past tense) that:",
    skills.length > 1
      ? `- Shows credible evidence for the cluster skills: ${skills.join(", ")}`
      : "- References this project as demonstrated, hands-on evidence of the skill",
    "- Mentions the GitHub repo naturally if appropriate",
    "- Aligns with the job description",
    "- Is truthful — only claim what the project/readme plausibly supports",
    "- 1–2 lines, ready to paste on a resume",
    "",
    "Return ONLY the bullet text.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callGemini({
    systemInstruction:
      "You write resume bullets backed by real portfolio work. Be specific and credible.",
    userPrompt: prompt,
    maxOutputTokens: 512,
    temperature: 0.35,
  });

  const optimizedBullet = raw
    .replace(/^```[\w]*\n?|```$/g, "")
    .trim()
    .replace(/^[-•*]\s+/, "")
    .replace(/^["'`]+|["'`]+$/g, "");

  if (optimizedBullet.length < 24) {
    throw new Error("Could not generate a resume bullet from this repository.");
  }

  const skill =
    input.clusterLabel ?? (skills.length === 1 ? skills[0] : skills.join(", "));

  return {
    skill,
    projectTitle: project.title,
    githubUrl,
    optimizedBullet,
    context: ctx,
  };
}
