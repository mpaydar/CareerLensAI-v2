"use client";

import { SkillProjectWizard } from "@/components/skill-project-wizard";
import { ResumeSkillOptimizer } from "@/components/resume-skill-optimizer";
import type { StoredGapAnalysis } from "@/lib/gap-types";
import {
  clusterMissingSkills,
  type SkillCluster,
} from "@/lib/skill-clusters";
import type { OptimizeMode } from "@/lib/resume-optimizer";
import type { ContextMismatchDetail } from "@/lib/gap-analysis-types";
import { useEffect, useMemo, useState } from "react";

type SkillGapDashboardProps = {
  analysis: StoredGapAnalysis | null;
  analyzing: boolean;
  error: string | null;
  ready: boolean;
  highlightText: string;
  onAnalyze: (jobDescription: string) => void;
};

type ChipVariant = "aligned" | "mismatch" | "missing" | "extra";

const CHIP_STYLES: Record<ChipVariant, string> = {
  aligned:
    "border-violet-500/40 bg-violet-500/10 text-violet-200 hover:border-violet-400/60",
  mismatch:
    "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200 hover:border-fuchsia-400/60 cursor-help",
  missing:
    "border-amber-500/40 bg-amber-500/10 text-amber-200 hover:border-amber-400/60 cursor-help",
  extra: "border-sky-500/40 bg-sky-500/10 text-sky-200",
};

const COLUMN_STYLES: Record<ChipVariant, string> = {
  aligned: "border-violet-900/50",
  mismatch: "border-fuchsia-900/50",
  missing: "border-amber-900/50",
  extra: "border-sky-900/50",
};

const TITLE_STYLES: Record<ChipVariant, string> = {
  aligned: "text-violet-400",
  mismatch: "text-fuchsia-400",
  missing: "text-amber-400",
  extra: "text-sky-400",
};

function isLikelyCompanyOverview(preview: string | undefined): boolean {
  if (!preview) {
    return false;
  }
  const lower = preview.toLowerCase();
  return (
    lower.includes("about the job") &&
    !lower.includes("qualifications") &&
    !lower.includes("requirements") &&
    !lower.includes("responsibilities")
  );
}

const TOOLTIP_LABELS: Record<"mismatch" | "missing", string> = {
  mismatch: "Why not context-aligned",
  missing: "Where the job needs this",
};

function SkillChip({
  skill,
  variant,
  tooltip,
  tooltipKind,
  optimizable,
  onOptimize,
}: {
  skill: string;
  variant: ChipVariant;
  tooltip?: string;
  tooltipKind?: "mismatch" | "missing";
  optimizable?: boolean;
  onOptimize?: (skill: string) => void;
}) {
  const chip = (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${CHIP_STYLES[variant]}`}
      title={tooltip && !optimizable ? tooltip : undefined}
      tabIndex={tooltip ? 0 : undefined}
    >
      {skill}
    </span>
  );

  if (optimizable && onOptimize) {
    return (
      <span className="group/chip relative inline-flex flex-col items-start gap-1">
        {chip}
        <button
          type="button"
          onClick={() => onOptimize(skill)}
          className="rounded-md bg-indigo-600/90 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-indigo-500"
        >
          {tooltipKind === "missing" ? "Build skill" : "Optimize"}
        </button>
        {tooltip ? (
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-0 z-30 mb-8 hidden w-72 max-w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-left text-[11px] leading-relaxed text-zinc-300 shadow-xl group-hover/chip:block"
          >
            {tooltipKind ? (
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                {TOOLTIP_LABELS[tooltipKind]}
              </span>
            ) : null}
            {tooltip}
          </span>
        ) : null}
      </span>
    );
  }

  if (!tooltip) {
    return chip;
  }

  return (
    <span className="group/chip relative">
      {chip}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-30 hidden w-72 max-w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-left text-[11px] leading-relaxed text-zinc-300 shadow-xl group-hover/chip:block group-focus-within/chip:block"
      >
        {tooltipKind ? (
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {TOOLTIP_LABELS[tooltipKind]}
          </span>
        ) : null}
        {tooltip}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-700" />
      </span>
    </span>
  );
}

function MissingSkillsColumn({
  skills,
  tooltips,
  clusters,
  onBuildCluster,
}: {
  skills: string[];
  tooltips: Record<string, string>;
  clusters: SkillCluster[];
  onBuildCluster: (cluster: SkillCluster) => void;
}) {
  return (
    <div className={`rounded-xl border bg-zinc-950/50 p-4 ${COLUMN_STYLES.missing}`}>
      <h3
        className={`mb-1 text-xs font-semibold uppercase tracking-wide ${TITLE_STYLES.missing}`}
      >
        In JD, not resume
      </h3>
      <p className="mb-3 text-[10px] text-zinc-600">
        Grouped by type · one portfolio path covers each cluster
      </p>
      {skills.length === 0 ? (
        <p className="text-xs text-zinc-500">None detected</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {skills.map((skill) => (
              <SkillChip
                key={skill}
                skill={skill}
                variant="missing"
                tooltip={tooltips[skill]}
                tooltipKind={tooltips[skill] ? "missing" : undefined}
              />
            ))}
          </div>
          <div className="space-y-3 border-t border-amber-900/30 pt-3">
            {clusters.map((cluster) => (
              <div
                key={cluster.id}
                className="rounded-lg border border-amber-900/40 bg-amber-950/15 p-3"
              >
                <p className="text-xs font-medium text-amber-100">{cluster.label}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
                  {cluster.skills.join(" · ")}
                </p>
                {cluster.contextSummary ? (
                  <p
                    className="mt-2 line-clamp-3 text-[10px] leading-relaxed text-zinc-400"
                    title={cluster.contextSummary}
                  >
                    {cluster.contextSummary.split("\n\n")[0]}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => onBuildCluster(cluster)}
                  className="mt-3 w-full rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-indigo-500"
                >
                  Build projects for cluster
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SkillColumn({
  title,
  hint,
  variant,
  skills,
  tooltips,
  tooltipKind,
  optimizable,
  onOptimize,
}: {
  title: string;
  hint?: string;
  variant: ChipVariant;
  skills: string[];
  tooltips?: Record<string, string>;
  tooltipKind?: "mismatch" | "missing";
  optimizable?: boolean;
  onOptimize?: (skill: string) => void;
}) {
  return (
    <div className={`rounded-xl border bg-zinc-950/50 p-4 ${COLUMN_STYLES[variant]}`}>
      <h3
        className={`mb-1 text-xs font-semibold uppercase tracking-wide ${TITLE_STYLES[variant]}`}
      >
        {title}
      </h3>
      {hint ? <p className="mb-3 text-[10px] text-zinc-600">{hint}</p> : <div className="mb-3" />}
      {skills.length === 0 ? (
        <p className="text-xs text-zinc-500">None detected</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <SkillChip
              key={skill}
              skill={skill}
              variant={variant}
              tooltip={tooltips?.[skill]}
              tooltipKind={tooltips?.[skill] ? tooltipKind : undefined}
              optimizable={optimizable}
              onOptimize={onOptimize}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchRing({
  percent,
  label,
  sublabel,
  noJobSkills,
}: {
  percent: number;
  label: string;
  sublabel: string;
  noJobSkills: boolean;
}) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative flex h-32 w-32 items-center justify-center">
      <svg className="-rotate-90" width="128" height="128" viewBox="0 0 128 128">
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="rgb(39 39 42)"
          strokeWidth="9"
        />
        {!noJobSkills ? (
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke="url(#matchGradient)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        ) : null}
        <defs>
          <linearGradient id="matchGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
        {noJobSkills ? (
          <>
            <span className="text-lg font-bold text-zinc-400">N/A</span>
            <span className="text-[10px] text-zinc-500">No JD skills</span>
          </>
        ) : (
          <>
            <span className="text-2xl font-bold text-zinc-50">{percent}%</span>
            <span className="text-[10px] text-zinc-400">{label}</span>
            <span className="text-[9px] text-zinc-600">{sublabel}</span>
          </>
        )}
      </div>
    </div>
  );
}

function buildMismatchTooltips(
  details: ContextMismatchDetail[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of details) {
    map[item.skill] = item.insight;
  }
  return map;
}

function JobDescriptionEditor({
  value,
  onChange,
  onAnalyze,
  analyzing,
  ready,
}: {
  value: string;
  onChange: (value: string) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  ready: boolean;
}) {
  return (
    <div className="mt-4 space-y-2">
      <label className="block text-xs font-medium text-zinc-400">
        Job description for analysis
      </label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={8}
        placeholder="Paste or edit the job description (requirements, tech stack). Extension highlights sync here automatically."
        className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={onAnalyze}
        disabled={!ready || analyzing || value.trim().length < 20}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {analyzing ? "Analyzing…" : "Analyze skills gap"}
      </button>
    </div>
  );
}

export function SkillGapDashboard({
  analysis,
  analyzing,
  error,
  ready,
  highlightText,
  onAnalyze,
}: SkillGapDashboardProps) {
  const [jdDraft, setJdDraft] = useState(highlightText);

  useEffect(() => {
    if (highlightText.trim()) {
      setJdDraft(highlightText);
    }
  }, [highlightText]);

  const runAnalyze = () => onAnalyze(jdDraft.trim());
  const [optimizing, setOptimizing] = useState<{
    skill: string;
    mode: OptimizeMode;
  } | null>(null);
  const [projectCluster, setProjectCluster] = useState<SkillCluster | null>(null);

  const mismatchTooltips = useMemo(
    () => buildMismatchTooltips(analysis?.contextMismatchDetails ?? []),
    [analysis?.contextMismatchDetails],
  );

  const missingTooltips = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of analysis?.missingInsights ?? []) {
      map[item.skill] = item.neededFor;
    }
    return map;
  }, [analysis?.missingInsights]);

  const missingClusters = useMemo(
    () =>
      clusterMissingSkills(
        analysis?.missing ?? [],
        analysis?.missingInsights ?? [],
      ),
    [analysis?.missing, analysis?.missingInsights],
  );

  if (!analysis && !analyzing) {
    return (
      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-indigo-950/40 p-6">
        <h2 className="text-sm uppercase tracking-wide text-zinc-400">
          Skills gap dashboard
        </h2>
        <p className="mt-2 max-w-xl text-sm text-zinc-500">
          {ready
            ? "Paste or sync the job description below. SpaCy needs the requirements / tech stack section—not only company overview."
            : "Upload your resume, then highlight or paste a job description."}
        </p>
        <JobDescriptionEditor
          value={jdDraft}
          onChange={setJdDraft}
          onAnalyze={runAnalyze}
          analyzing={analyzing}
          ready={ready}
        />
        {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
      </section>
    );
  }

  const lexicalPercent = analysis?.matchPercent ?? 0;
  const contextPercent = analysis?.contextMatchPercent ?? 0;
  const summary = analysis?.summary;
  const noJobSkills =
    analysis?.noJobSkillsDetected ?? (summary?.jobSkillCount ?? 0) === 0;
  const showOverviewWarning = isLikelyCompanyOverview(
    analysis?.jobDescriptionPreview,
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-indigo-950/40">
      <div className="border-b border-zinc-800/80 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              Skills gap dashboard
            </h2>
            <p className="text-xs text-zinc-500">
              {analysis?.analysisEngine === "gemini"
                ? "Gemini (fallback — set LLM_LAYER_URL for SpaCy)"
                : "SpaCy"}{" "}
              · keyword match + contextual fit ·{" "}
              {analysis?.resumeFileName ?? "Resume"}
            </p>
          </div>
          <button
            type="button"
            onClick={runAnalyze}
            disabled={!ready || analyzing || jdDraft.trim().length < 20}
            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
          >
            {analyzing ? "Analyzing…" : "Re-analyze"}
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
        {noJobSkills && !analyzing ? (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {showOverviewWarning ? (
              <>
                Your highlight looks like company overview only. Paste the full
                requirements below (Python, SQL, Airflow, etc.), then
                re-analyze.
              </>
            ) : (
              <>
                No skills found in the job description text. Paste the
                requirements / tech stack below, then re-analyze.
              </>
            )}
          </div>
        ) : null}
        <JobDescriptionEditor
          value={jdDraft}
          onChange={setJdDraft}
          onAnalyze={runAnalyze}
          analyzing={analyzing}
          ready={ready}
        />
      </div>

      <div className="flex flex-col items-center gap-4 border-b border-zinc-800/80 px-6 py-6">
        <div className="flex gap-4">
          <MatchRing
            percent={analyzing ? 0 : lexicalPercent}
            label="Keyword"
            sublabel="lexical match"
            noJobSkills={noJobSkills}
          />
          <MatchRing
            percent={analyzing ? 0 : contextPercent}
            label="Context"
            sublabel="same setting"
            noJobSkills={noJobSkills}
          />
        </div>
        {summary ? (
          <div className="grid w-full max-w-md grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-zinc-950/60 px-2 py-2">
              <p className="font-semibold text-violet-300">
                {summary.contextAlignedCount}
              </p>
              <p className="text-zinc-500">Context fit</p>
            </div>
            <div className="rounded-lg bg-zinc-950/60 px-2 py-2">
              <p className="font-semibold text-fuchsia-300">
                {summary.contextMismatchCount}
              </p>
              <p className="text-zinc-500">Mismatch</p>
            </div>
            <div className="rounded-lg bg-zinc-950/60 px-2 py-2">
              <p className="font-semibold text-amber-300">
                {summary.missingCount}
              </p>
              <p className="text-zinc-500">Gap</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">
        <SkillColumn
          title="Context aligned"
          variant="aligned"
          skills={analysis?.contextAligned ?? []}
        />
        <SkillColumn
          title="Context mismatch"
          hint="Hover for context · Optimize to reframe the bullet"
          variant="mismatch"
          skills={analysis?.contextMismatch ?? []}
          tooltips={mismatchTooltips}
          tooltipKind="mismatch"
          optimizable
          onOptimize={(skill) => setOptimizing({ skill, mode: "reframe" })}
        />
        <MissingSkillsColumn
          skills={analysis?.missing ?? []}
          tooltips={missingTooltips}
          clusters={missingClusters}
          onBuildCluster={setProjectCluster}
        />
        <SkillColumn
          title={noJobSkills ? "Resume skills" : "On resume only"}
          variant="extra"
          skills={
            noJobSkills
              ? (analysis?.resumeSkills ?? [])
              : (analysis?.extra ?? [])
          }
        />
      </div>

      {analysis?.jobDescriptionPreview ? (
        <div className="border-t border-zinc-800/80 px-6 py-3 text-xs text-zinc-600">
          JD preview: {analysis.jobDescriptionPreview}
          {analysis.jobDescriptionPreview.length >= 280 ? "…" : ""}
        </div>
      ) : null}

      {analyzing ? (
        <div className="border-t border-zinc-800/80 px-6 py-3 text-center text-xs text-indigo-300">
          Running SpaCy skill + context extraction…
        </div>
      ) : null}

      {projectCluster ? (
        <SkillProjectWizard
          cluster={projectCluster}
          onClose={() => setProjectCluster(null)}
        />
      ) : null}

      {optimizing ? (
        <ResumeSkillOptimizer
          skill={optimizing.skill}
          mode="reframe"
          neededFor={missingTooltips[optimizing.skill]}
          onClose={() => setOptimizing(null)}
        />
      ) : null}
    </section>
  );
}
