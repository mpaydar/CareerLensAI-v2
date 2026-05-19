import type { MissingSkillInsight } from "@/lib/gap-analysis-types";

export type SkillClusterKind = "technical" | "domain" | "soft";

export type SkillCluster = {
  id: string;
  label: string;
  kind: SkillClusterKind;
  skills: string[];
  /** Combined JD context for why these skills matter */
  contextSummary: string;
};

type SkillCategory = SkillClusterKind | "unknown";

const TECH_FAMILIES: { id: string; label: string; keywords: string[] }[] = [
  {
    id: "jvm",
    label: "JVM ecosystem",
    keywords: ["java", "scala", "kotlin", "jvm", "spring", "maven", "gradle"],
  },
  {
    id: "dotnet",
    label: ".NET stack",
    keywords: ["c#", "csharp", ".net", "dotnet", "asp.net", "blazor"],
  },
  {
    id: "frontend",
    label: "Frontend & TypeScript",
    keywords: [
      "typescript",
      "javascript",
      "react",
      "vue",
      "angular",
      "next.js",
      "nextjs",
      "svelte",
      "html",
      "css",
      "tailwind",
    ],
  },
  {
    id: "python",
    label: "Python stack",
    keywords: ["python", "flask", "django", "fastapi", "pandas", "numpy"],
  },
  {
    id: "data",
    label: "Data & analytics",
    keywords: [
      "sql",
      "spark",
      "hadoop",
      "kafka",
      "airflow",
      "dbt",
      "snowflake",
      "redshift",
      "bigquery",
      "etl",
    ],
  },
  {
    id: "cloud",
    label: "Cloud & DevOps",
    keywords: [
      "aws",
      "azure",
      "gcp",
      "kubernetes",
      "docker",
      "terraform",
      "ci/cd",
      "devops",
      "linux",
    ],
  },
  {
    id: "mobile",
    label: "Mobile",
    keywords: ["swift", "ios", "android", "kotlin", "flutter", "react native"],
  },
  {
    id: "go-rust",
    label: "Systems languages",
    keywords: ["golang", "go", "rust", "c++", "cpp"],
  },
];

const DOMAIN_KEYWORDS = [
  "e-commerce",
  "ecommerce",
  "startup",
  "fintech",
  "healthcare",
  "saas",
  "b2b",
  "b2c",
  "retail",
  "marketplace",
  "enterprise",
  "consulting",
];

const SOFT_KEYWORDS = [
  "leadership",
  "mentor",
  "communication",
  "agile",
  "scrum",
  "stakeholder",
  "cross-functional",
  "team lead",
  "management",
  "collaboration",
  "presentation",
];

function normalize(skill: string): string {
  return skill.trim().toLowerCase();
}

function matchesKeyword(skillNorm: string, keyword: string): boolean {
  const kw = keyword.toLowerCase();
  if (skillNorm === kw) return true;
  if (skillNorm.includes(kw)) return true;
  if (kw.length >= 4 && skillNorm.replace(/[^a-z0-9+#.]/g, "").includes(kw)) {
    return true;
  }
  return false;
}

function classifySkill(skill: string): SkillCategory {
  const n = normalize(skill);

  for (const kw of SOFT_KEYWORDS) {
    if (matchesKeyword(n, kw)) return "soft";
  }
  for (const kw of DOMAIN_KEYWORDS) {
    if (matchesKeyword(n, kw)) return "domain";
  }
  for (const family of TECH_FAMILIES) {
    for (const kw of family.keywords) {
      if (matchesKeyword(n, kw)) return "technical";
    }
  }

  if (
    /^[a-z0-9+#.]+$/i.test(skill.trim()) &&
    skill.trim().length <= 24 &&
    !/\s/.test(skill.trim())
  ) {
    return "technical";
  }

  return "unknown";
}

function techFamilyForSkill(skill: string): string | null {
  const n = normalize(skill);
  for (const family of TECH_FAMILIES) {
    for (const kw of family.keywords) {
      if (matchesKeyword(n, kw)) return family.id;
    }
  }
  return null;
}

function buildContextSummary(
  skills: string[],
  insights: Map<string, string>,
): string {
  const parts = skills
    .map((s) => {
      const insight = insights.get(s);
      return insight ? `${s}: ${insight}` : s;
    })
    .filter(Boolean);
  return parts.join("\n\n");
}

function clusterTechnical(skills: string[]): SkillCluster[] {
  if (skills.length === 0) return [];

  const byFamily = new Map<string, string[]>();
  const unassigned: string[] = [];

  for (const skill of skills) {
    const familyId = techFamilyForSkill(skill);
    if (familyId) {
      const list = byFamily.get(familyId) ?? [];
      list.push(skill);
      byFamily.set(familyId, list);
    } else {
      unassigned.push(skill);
    }
  }

  const clusters: SkillCluster[] = [];

  for (const [familyId, familySkills] of byFamily) {
    if (familySkills.length >= 2) {
      const family = TECH_FAMILIES.find((f) => f.id === familyId);
      clusters.push({
        id: `tech-${familyId}`,
        label: family?.label ?? "Technical stack",
        kind: "technical",
        skills: familySkills,
        contextSummary: "",
      });
    } else {
      unassigned.push(...familySkills);
    }
  }

  if (unassigned.length > 0) {
    const label =
      unassigned.length === 1
        ? unassigned[0]
        : `Technical stack (${unassigned.join(", ")})`;
    clusters.push({
      id: `tech-combined-${unassigned.map(normalize).join("-")}`,
      label,
      kind: "technical",
      skills: unassigned,
      contextSummary: "",
    });
  }

  if (clusters.length > 1) {
    const total = clusters.reduce((n, c) => n + c.skills.length, 0);
    if (total <= 5) {
      const allSkills = clusters.flatMap((c) => c.skills);
      return [
        {
          id: `tech-merged-${allSkills.map(normalize).join("-")}`,
          label: `Technical gaps (${allSkills.join(", ")})`,
          kind: "technical",
          skills: allSkills,
          contextSummary: "",
        },
      ];
    }
  }

  return clusters;
}

/**
 * Group missing JD skills into clusters so one portfolio path covers related tools.
 */
export function clusterMissingSkills(
  skills: string[],
  insights: MissingSkillInsight[] = [],
): SkillCluster[] {
  if (skills.length === 0) return [];

  const insightMap = new Map(
    insights.map((i) => [i.skill, i.neededFor] as const),
  );

  const technical: string[] = [];
  const domain: string[] = [];
  const soft: string[] = [];
  const unknown: string[] = [];

  for (const skill of skills) {
    const cat = classifySkill(skill);
    if (cat === "technical") technical.push(skill);
    else if (cat === "domain") domain.push(skill);
    else if (cat === "soft") soft.push(skill);
    else unknown.push(skill);
  }

  const clusters: SkillCluster[] = [];

  clusters.push(...clusterTechnical(technical));

  const roleSkills = [...domain, ...soft, ...unknown];
  if (roleSkills.length > 0) {
    const label =
      roleSkills.length === 1
        ? roleSkills[0]
        : domain.length > 0 && soft.length > 0
          ? "Role, domain & leadership"
          : domain.length > 0
            ? "Domain & industry context"
            : "Professional & leadership skills";
    clusters.push({
      id: `role-${roleSkills.map(normalize).join("-")}`,
      label,
      kind: domain.length >= soft.length ? "domain" : "soft",
      skills: roleSkills,
      contextSummary: "",
    });
  }

  return clusters.map((c) => ({
    ...c,
    contextSummary: buildContextSummary(c.skills, insightMap),
  }));
}
