export type ParsedProjectMeta = {
  id: string;
  title: string;
  summary: string;
  estimatedHours: number;
  gapCoveragePercent: number;
  buildsOn: string;
  deliverables: string[];
};

/** Parse model output in simple KEY: value lines (no JSON). */
export function parseProjectMetaFromLines(
  raw: string,
  index: number,
): ParsedProjectMeta {
  const lines = raw
    .replace(/^```[\w]*\n?|```$/gim, "")
    .trim()
    .split("\n");

  const fields = new Map<string, string>();
  const deliverables: string[] = [];
  let currentKey: string | null = null;

  for (const line of lines) {
    const match = line.match(/^([A-Z_]+):\s*(.*)$/i);
    if (match) {
      currentKey = match[1].toUpperCase();
      const value = match[2].trim();
      if (currentKey === "DELIVERABLE" || currentKey === "DELIVERABLES") {
        if (value) deliverables.push(value);
      } else {
        fields.set(currentKey, value);
      }
      continue;
    }

    if (currentKey === "SUMMARY" && line.trim()) {
      const prev = fields.get("SUMMARY") ?? "";
      fields.set("SUMMARY", prev ? `${prev} ${line.trim()}` : line.trim());
    }
  }

  const title = fields.get("TITLE")?.trim();
  const summary = fields.get("SUMMARY")?.trim();
  if (!title || !summary) {
    throw new Error("Missing TITLE or SUMMARY in project response");
  }

  const hours = Number(fields.get("HOURS") ?? fields.get("ESTIMATEDHOURS") ?? 6);
  const coverage = Number(
    fields.get("COVERAGE") ?? fields.get("GAPCOVERAGEPERCENT") ?? 75,
  );

  return {
    id: `project-${index + 1}`,
    title,
    summary,
    estimatedHours: Math.min(8, Math.max(4, Number.isFinite(hours) ? hours : 6)),
    gapCoveragePercent: Math.min(
      100,
      Math.max(70, Number.isFinite(coverage) ? coverage : 75),
    ),
    buildsOn:
      fields.get("BUILDS_ON")?.trim() ||
      fields.get("BUILDSON")?.trim() ||
      "Related resume experience",
    deliverables:
      deliverables.length > 0
        ? deliverables
        : ["Public GitHub repository", "README with setup and demo"],
  };
}

export const PROJECT_META_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    summary: { type: "string" },
    estimatedHours: { type: "integer" },
    gapCoveragePercent: { type: "integer" },
    buildsOn: { type: "string" },
    deliverables: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "title",
    "summary",
    "estimatedHours",
    "gapCoveragePercent",
    "buildsOn",
    "deliverables",
  ],
} as const;
