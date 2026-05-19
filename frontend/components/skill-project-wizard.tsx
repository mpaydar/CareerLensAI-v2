"use client";

import { useAccount } from "@/components/account-provider";
import { downloadProjectGuidePdf } from "@/lib/download-project-guide";
import type { SkillCluster } from "@/lib/skill-clusters";
import type { SkillProjectSuggestion } from "@/lib/skill-projects";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type WizardStep = "intro" | "generating" | "projects" | "github" | "bullet";
type GuideStatus = "pending" | "loading" | "ready" | "error";

const GENERATING_MESSAGES = [
  "Analyzing your past experience…",
  "Matching projects to the job description…",
  "Designing 3 portfolio projects…",
  "Writing hands-on instruction guides…",
];

type SkillProjectWizardProps = {
  cluster: SkillCluster;
  onClose: () => void;
};

function clusterApiBody(cluster: SkillCluster) {
  return {
    skills: cluster.skills,
    clusterLabel: cluster.label,
    clusterKind: cluster.kind,
    contextSummary: cluster.contextSummary,
  };
}

function GeneratingAnimation({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="relative mb-6 h-16 w-16">
        <span className="absolute inset-0 animate-ping rounded-full bg-indigo-500/20" />
        <span className="absolute inset-2 animate-pulse rounded-full bg-indigo-500/30" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
        </span>
      </div>
      <p className="text-sm font-medium text-zinc-200">Generating projects</p>
      <p className="mt-2 max-w-xs text-xs text-zinc-500">{message}</p>
      <p className="mt-4 text-[11px] text-zinc-600">
        This usually takes 30–90 seconds. You can keep this open.
      </p>
    </div>
  );
}

export function SkillProjectWizard({
  cluster,
  onClose,
}: SkillProjectWizardProps) {
  const { handleRateLimitResponse, refreshAccount } = useAccount();
  const clusterBody = useMemo(() => clusterApiBody(cluster), [cluster]);
  const headline =
    cluster.skills.length === 1 ? cluster.skills[0] : cluster.label;
  const [step, setStep] = useState<WizardStep>("intro");
  const [loadingBullet, setLoadingBullet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<SkillProjectSuggestion[]>([]);
  const [guideStatus, setGuideStatus] = useState<Record<string, GuideStatus>>({});
  const [guidesReady, setGuidesReady] = useState(0);
  const [generatingMessage, setGeneratingMessage] = useState(GENERATING_MESSAGES[0]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [bullet, setBullet] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const messageIndex = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;
  const allGuidesReady =
    projects.length === 3 &&
    projects.every((p) => guideStatus[p.id] === "ready");
  const guidesInProgress = guidesReady < 3 && projects.length > 0;

  useEffect(() => {
    if (step !== "generating" && !(step === "projects" && guidesInProgress)) {
      return;
    }
    const interval = setInterval(() => {
      messageIndex.current =
        (messageIndex.current + 1) % GENERATING_MESSAGES.length;
      setGeneratingMessage(GENERATING_MESSAGES[messageIndex.current]);
    }, 2800);
    return () => clearInterval(interval);
  }, [step, guidesInProgress]);

  const loadGuide = useCallback(
    async (
      project: SkillProjectSuggestion,
      signal: AbortSignal,
    ): Promise<void> => {
      setGuideStatus((prev) => ({ ...prev, [project.id]: "loading" }));
      try {
        const response = await fetch("/api/projects/guide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...clusterBody, project }),
          signal,
        });
        const data = (await response.json()) as {
          instructionGuide?: string;
          error?: string;
          code?: string;
        };
        if (handleRateLimitResponse(response, data)) {
          return;
        }
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to generate guide");
        }
        const guide = data.instructionGuide?.trim() ?? "";
        if (guide.length < 100) {
          throw new Error("Guide was too short");
        }
        setProjects((prev) =>
          prev.map((p) =>
            p.id === project.id ? { ...p, instructionGuide: guide } : p,
          ),
        );
        setGuideStatus((prev) => ({ ...prev, [project.id]: "ready" }));
        setGuidesReady((n) => n + 1);
      } catch (e) {
        if (signal.aborted) return;
        setGuideStatus((prev) => ({ ...prev, [project.id]: "error" }));
      }
    },
    [clusterBody, handleRateLimitResponse],
  );

  const fetchProjects = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStep("generating");
    setError(null);
    setProjects([]);
    setGuideStatus({});
    setGuidesReady(0);
    messageIndex.current = 0;
    setGeneratingMessage(GENERATING_MESSAGES[0]);

    try {
      const response = await fetch("/api/projects/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clusterBody),
        signal: controller.signal,
      });
      const data = (await response.json()) as {
        projects?: SkillProjectSuggestion[];
        error?: string;
        code?: string;
      };
      if (handleRateLimitResponse(response, data)) {
        setStep("intro");
        return;
      }
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load projects");
      }
      if (!data.projects?.length) {
        throw new Error("No projects were returned. Try again.");
      }

      const meta = data.projects;
      setProjects(meta);
      setStep("projects");
      const initialStatus = Object.fromEntries(
        meta.map((p) => [p.id, "pending" as GuideStatus]),
      );
      setGuideStatus(initialStatus);

      await Promise.all(
        meta.map((project) => loadGuide(project, controller.signal)),
      );
      await refreshAccount();
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Failed to load projects");
      setStep("intro");
    }
  }, [clusterBody, loadGuide, handleRateLimitResponse, refreshAccount]);

  const retryGuide = useCallback(
    (project: SkillProjectSuggestion) => {
      const controller = new AbortController();
      void loadGuide(project, controller.signal);
    },
    [loadGuide],
  );

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const generateBullet = useCallback(async () => {
    if (!selectedProject) return;
    setLoadingBullet(true);
    setError(null);
    try {
      const response = await fetch("/api/projects/bullet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...clusterBody,
          githubUrl,
          project: selectedProject,
        }),
      });
      const data = (await response.json()) as {
        optimizedBullet?: string;
        error?: string;
        code?: string;
      };
      if (handleRateLimitResponse(response, data)) {
        return;
      }
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to generate bullet");
      }
      if (!data.optimizedBullet?.trim()) {
        throw new Error("No bullet was generated.");
      }
      setBullet(data.optimizedBullet.trim());
      setStep("bullet");
      await refreshAccount();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate bullet");
    } finally {
      setLoadingBullet(false);
    }
  }, [
    clusterBody,
    githubUrl,
    selectedProject,
    handleRateLimitResponse,
    refreshAccount,
  ]);

  const copyGuide = async (project: SkillProjectSuggestion) => {
    try {
      await navigator.clipboard.writeText(project.instructionGuide);
    } catch {
      setError("Could not copy instructions.");
    }
  };

  const copyBullet = async () => {
    if (!bullet) return;
    try {
      await navigator.clipboard.writeText(bullet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy bullet.");
    }
  };

  const downloadPdf = (project: SkillProjectSuggestion) => {
    try {
      downloadProjectGuidePdf(headline, project);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open PDF.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="project-wizard-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">
              Close skill gap
            </p>
            <h3 id="project-wizard-title" className="text-lg font-semibold text-zinc-100">
              {headline}
            </h3>
            {cluster.skills.length > 1 ? (
              <p className="mt-1 text-xs text-amber-200/80">
                Covers: {cluster.skills.join(" · ")}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-zinc-500">
              One ≤8h project demonstrating every skill in this cluster → GitHub → resume bullet.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          {step === "intro" ? (
            <div className="space-y-4 text-sm text-zinc-300">
              <ol className="list-decimal space-y-2 pl-5 text-zinc-400">
                <li>Get 3 project ideas that use every skill in this cluster (≤8 hours each).</li>
                <li>Follow the 3-page instruction guide (no scripts — hands-on only).</li>
                <li>Publish on public GitHub with evidence for each tool.</li>
                <li>Submit your repo to generate a resume bullet backed by real work.</li>
              </ol>
              {cluster.contextSummary ? (
                <p className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs leading-relaxed text-amber-200/90 whitespace-pre-wrap">
                  {cluster.contextSummary}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void fetchProjects()}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Get 3 suggested projects
              </button>
            </div>
          ) : null}

          {step === "generating" ? (
            <GeneratingAnimation message={generatingMessage} />
          ) : null}

          {step === "projects" ? (
            <div className="space-y-3">
              {guidesInProgress ? (
                <div className="rounded-lg border border-indigo-900/50 bg-indigo-950/30 px-3 py-2.5">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-indigo-200">
                      {generatingMessage}
                    </span>
                    <span className="font-medium text-indigo-300">
                      {guidesReady}/3 guides
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                      style={{ width: `${(guidesReady / 3) * 100}%` }}
                    />
                  </div>
                </div>
              ) : allGuidesReady ? (
                <p className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200/90">
                  All guides ready — view, copy, or download as PDF.
                </p>
              ) : null}

              {projects.map((project) => {
                const isSelected = selectedId === project.id;
                const isExpanded = expandedId === project.id;
                const status = guideStatus[project.id] ?? "pending";
                const guideReady = status === "ready" && project.instructionGuide.length > 0;

                return (
                  <article
                    key={project.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      isSelected
                        ? "border-indigo-500/60 bg-indigo-950/20"
                        : "border-zinc-800 bg-zinc-950/50"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h4 className="font-medium text-zinc-100">{project.title}</h4>
                        <p className="mt-1 text-xs text-zinc-400">{project.summary}</p>
                        <p className="mt-2 text-[11px] text-zinc-500">
                          ~{project.estimatedHours}h · covers ~{project.gapCoveragePercent}% of
                          gap · builds on: {project.buildsOn}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!guideReady}
                          onClick={() => {
                            setSelectedId(project.id);
                            setExpandedId(project.id);
                          }}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-40 ${
                            isSelected
                              ? "bg-indigo-600 text-white"
                              : "border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                          }`}
                        >
                          {isSelected ? "Selected" : "Select"}
                        </button>
                        <button
                          type="button"
                          disabled={!guideReady && status !== "error"}
                          onClick={() =>
                            setExpandedId(isExpanded ? null : project.id)
                          }
                          className="rounded-md border border-zinc-600 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                        >
                          {status === "loading" || status === "pending"
                            ? "Loading guide…"
                            : isExpanded
                              ? "Hide guide"
                              : "View guide"}
                        </button>
                      </div>
                    </div>

                    {(status === "loading" || status === "pending") && isExpanded ? (
                      <div className="mt-4 flex items-center gap-3 border-t border-zinc-800 pt-4 text-xs text-zinc-500">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                        Writing your 3-page instruction guide…
                      </div>
                    ) : null}

                    {status === "error" ? (
                      <div className="mt-3 flex items-center gap-2">
                        <p className="text-xs text-red-400">Guide failed to generate.</p>
                        <button
                          type="button"
                          onClick={() => retryGuide(project)}
                          className="text-xs text-indigo-300 underline"
                        >
                          Retry
                        </button>
                      </div>
                    ) : null}

                    {isExpanded && guideReady ? (
                      <div className="mt-4 border-t border-zinc-800 pt-4">
                        <div className="mb-2 flex flex-wrap justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => void copyGuide(project)}
                            className="text-xs text-indigo-300 underline hover:text-indigo-200"
                          >
                            Copy instructions
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadPdf(project)}
                            className="text-xs text-indigo-300 underline hover:text-indigo-200"
                          >
                            Download PDF
                          </button>
                        </div>
                        <div className="prose prose-invert max-w-none whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                          {project.instructionGuide}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {selectedProject && allGuidesReady ? (
                <button
                  type="button"
                  onClick={() => setStep("github")}
                  className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600"
                >
                  I completed this project — add GitHub repo
                </button>
              ) : selectedProject && !allGuidesReady ? (
                <p className="text-center text-xs text-zinc-500">
                  Wait for all guides to finish before continuing.
                </p>
              ) : (
                <p className="text-center text-xs text-zinc-500">
                  Select a project once its guide is ready.
                </p>
              )}
            </div>
          ) : null}

          {step === "github" && selectedProject ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">
                Selected: <span className="text-zinc-200">{selectedProject.title}</span>
              </p>
              <label className="block text-xs font-medium text-zinc-400">
                Public GitHub repository URL
              </label>
              <input
                type="url"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/you/your-project"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
              <p className="text-xs text-zinc-500">
                We read your README to write a bullet tied to published work. Repo must be
                public.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep("projects")}
                  className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={loadingBullet || githubUrl.trim().length < 8}
                  onClick={() => void generateBullet()}
                  className="flex-1 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {loadingBullet ? "Writing resume bullet…" : "Generate resume bullet"}
                </button>
              </div>
            </div>
          ) : null}

          {step === "bullet" && bullet ? (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
                Resume bullet (from your GitHub project)
              </p>
              <p className="rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-3 text-sm leading-relaxed text-zinc-50">
                {bullet}
              </p>
              <p className="text-xs text-zinc-500 break-all">Source: {githubUrl}</p>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          {step === "bullet" && bullet ? (
            <button
              type="button"
              onClick={() => void copyBullet()}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            >
              {copied ? "Copied!" : "Copy resume bullet"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
