"use client";

import { AccountProvider, useAccount } from "@/components/account-provider";
import { InterviewPrepCoach } from "@/components/interview-prep-coach";
import { OnboardingWelcome } from "@/components/onboarding-welcome";
import { SkillGapDashboard } from "@/components/skill-gap-dashboard";
import { ApplicationsInsight } from "@/components/applications-insight";
import { UsageBanner } from "@/components/usage-banner";
import type { ResumeMeta } from "@/lib/account-types";
import type { StoredGapAnalysis } from "@/lib/gap-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type HighlightResponse = {
  text: string;
  sourceUrl: string;
  jobId: string;
  updatedAt: string;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Home() {
  return (
    <AccountProvider>
      <HomeApp />
    </AccountProvider>
  );
}

function HomeApp() {
  const { user, loading, resume: resumeMeta, refreshAccount } = useAccount();
  const [highlight, setHighlight] = useState<HighlightResponse>({
    text: "",
    sourceUrl: "",
    jobId: "",
    updatedAt: "",
  });
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [gapAnalysis, setGapAnalysis] = useState<StoredGapAnalysis | null>(null);
  const [gapAnalyzing, setGapAnalyzing] = useState(false);
  const [gapError, setGapError] = useState<string | null>(null);
  const lastPublishedOnPage = useRef("");
  const lastAnalyzedKey = useRef("");
  const analyzeDebounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let isMounted = true;
    let selectionDebounce: number | undefined;

    const pullLatestHighlight = async () => {
      try {
        const response = await fetch("/api/highlight", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("failed to fetch highlight");
        }

        const data = (await response.json()) as HighlightResponse;

        if (isMounted) {
          setHighlight(data);
          setIsOnline(true);
          if (!data.text.trim()) {
            setGapAnalysis(null);
            lastAnalyzedKey.current = "";
          }
        }
      } catch {
        if (isMounted) {
          setIsOnline(false);
        }
      }
    };

    /** Works in Cursor/VS Code preview (no extension). Cross-tab capture still needs Chrome + extension. */
    const publishSelectionFromThisPage = async () => {
      const text = window.getSelection()?.toString().trim() ?? "";
      if (!text) {
        lastPublishedOnPage.current = "";
        return;
      }
      if (text === lastPublishedOnPage.current) {
        return;
      }
      lastPublishedOnPage.current = text;

      try {
        const response = await fetch("/api/highlight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ text, sourceUrl: window.location.href }),
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as HighlightResponse;
        if (isMounted) {
          setHighlight(data);
          setIsOnline(true);
        }
      } catch {
        if (isMounted) {
          setIsOnline(false);
        }
      }
    };

    const schedulePublishFromPage = () => {
      window.clearTimeout(selectionDebounce);
      selectionDebounce = window.setTimeout(() => {
        void publishSelectionFromThisPage();
      }, 150);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void pullLatestHighlight();
      }
    };

    pullLatestHighlight();
    const intervalId = window.setInterval(pullLatestHighlight, 500);
    window.addEventListener("focus", pullLatestHighlight);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift" || event.key.startsWith("Arrow")) {
        schedulePublishFromPage();
      }
    };

    const onSelectionChange = () => {
      schedulePublishFromPage();
    };

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("mouseup", schedulePublishFromPage);
    document.addEventListener("keyup", onKeyUp);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.clearTimeout(selectionDebounce);
      window.removeEventListener("focus", pullLatestHighlight);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("mouseup", schedulePublishFromPage);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/gap", { cache: "no-store" });
        if (!response.ok || cancelled) {
          return;
        }
        const data = (await response.json()) as {
          analysis: StoredGapAnalysis | null;
        };
        if (!cancelled) {
          setGapAnalysis(data.analysis);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const runGapAnalysis = useCallback(async () => {
    setGapError(null);
    setGapAnalyzing(true);
    try {
      const response = await fetch("/api/gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: highlight.text }),
      });
      const data = (await response.json()) as {
        analysis?: StoredGapAnalysis;
        error?: string;
      };
      if (!response.ok) {
        setGapError(data.error ?? "Analysis failed.");
        return;
      }
      if (data.analysis) {
        setGapAnalysis(data.analysis);
        lastAnalyzedKey.current = `${highlight.jobId}:${highlight.updatedAt}:${highlight.text.length}`;
      }
    } catch {
      setGapError(
        "Could not run analysis. Ensure the LLM layer is running (LLM_LAYER_URL in frontend/.env.local) or run: npm run llm:setup",
      );
    } finally {
      setGapAnalyzing(false);
    }
  }, [highlight.text, highlight.jobId, highlight.updatedAt]);

  const gapReady = useMemo(
    () => Boolean(resumeMeta) && highlight.text.trim().length >= 20,
    [resumeMeta, highlight.text],
  );

  useEffect(() => {
    if (!gapReady) {
      return;
    }

    const analysisKey = `${highlight.jobId}:${highlight.updatedAt}:${highlight.text.length}`;
    if (analysisKey === lastAnalyzedKey.current) {
      return;
    }

    window.clearTimeout(analyzeDebounceRef.current);
    analyzeDebounceRef.current = window.setTimeout(() => {
      void runGapAnalysis();
    }, 1500);

    return () => {
      window.clearTimeout(analyzeDebounceRef.current);
    };
  }, [gapReady, highlight.text, highlight.jobId, highlight.updatedAt, runGapAnalysis]);

  const sendResumeFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setUploadError(null);
    setUploadBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/resume", { method: "POST", body });
      const data = (await response.json()) as {
        meta?: ResumeMeta;
        error?: string;
      };
      if (!response.ok) {
        setUploadError(data.error ?? "Upload failed.");
        return;
      }
      if (data.meta) {
        await refreshAccount();
        setGapAnalysis(null);
        lastAnalyzedKey.current = "";
      }
    } catch {
      setUploadError("Upload failed.");
    } finally {
      setUploadBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const clearHighlight = async () => {
    try {
      const response = await fetch("/api/highlight", { method: "DELETE" });
      if (!response.ok) {
        throw new Error();
      }
      const data = (await response.json()) as HighlightResponse;
      setHighlight(data);
      setGapAnalysis(null);
      setGapError(null);
      lastPublishedOnPage.current = "";
      lastAnalyzedKey.current = "";
      window.getSelection()?.removeAllRanges();
      window.dispatchEvent(new CustomEvent("resumesnap-highlight-cleared"));
    } catch {
      setGapError("Could not clear highlight.");
    }
  };

  const removeResume = async () => {
    setUploadError(null);
    setUploadBusy(true);
    try {
      const response = await fetch("/api/resume", { method: "DELETE" });
      if (!response.ok) {
        throw new Error();
      }
      await refreshAccount();
      setGapAnalysis(null);
      lastAnalyzedKey.current = "";
    } catch {
      setUploadError("Could not remove resume.");
    } finally {
      setUploadBusy(false);
    }
  };

  const statusLabel = useMemo(() => {
    if (!isOnline) {
      return "Disconnected from local API";
    }
    if (!highlight.text) {
      return "Waiting for highlighted text...";
    }
    return "Live updates active";
  }, [highlight.text, isOnline]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    );
  }

  if (!user?.onboardingComplete) {
    return <OnboardingWelcome />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-10">
        <div>
          <h1 className="text-3xl font-semibold">
            ResumeSnap
            <span className="ml-2 text-lg font-normal text-zinc-500">
              · {user.firstName}
            </span>
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Highlight a job description, analyze skill gaps, and tailor your
            resume with AI.
          </p>
        </div>

        <UsageBanner />

        <ApplicationsInsight currentJobId={highlight.jobId || undefined} />

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm uppercase tracking-wide text-zinc-400">
              Latest Highlight
            </h2>
            <button
              type="button"
              onClick={() => void clearHighlight()}
              disabled={!highlight.text}
              className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear highlight
            </button>
          </div>
          <pre className="max-h-[420px] min-h-[160px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-zinc-950 p-4 text-sm leading-relaxed text-zinc-100">
            {highlight.text || "No text captured yet."}
          </pre>
          <p className="mt-3 text-xs text-zinc-600">
            Select job description text on LinkedIn (extension) or on this page.
            Same job appends with a separator; a new job replaces the box.
          </p>
          <div className="mt-4 text-xs text-zinc-500">
            {highlight.updatedAt
              ? `Updated: ${new Date(highlight.updatedAt).toLocaleTimeString()}`
              : "Updated: --"}
          </div>
          {highlight.jobId ? (
            <div className="mt-1 text-xs text-zinc-500">
              Job ID: {highlight.jobId}
            </div>
          ) : null}
          <div className="mt-1 text-xs text-zinc-500 break-all">
            {highlight.sourceUrl
              ? `Source: ${highlight.sourceUrl}`
              : "Source: --"}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm uppercase tracking-wide text-zinc-400">
            Your resume
          </h2>
          <p className="mb-4 text-sm text-zinc-500">
            PDF or Word (.doc, .docx), up to 10 MB. Replace anytime with an
            updated version.
          </p>
          <input
            ref={fileInputRef}
            id="resume-file"
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            disabled={uploadBusy}
            onChange={(e) => void sendResumeFile(e.target.files?.[0])}
          />
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              void sendResumeFile(e.dataTransfer.files?.[0]);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors ${
              dragActive
                ? "border-indigo-400 bg-zinc-800/80"
                : "border-zinc-600 bg-zinc-950/50 hover:border-zinc-500"
            } ${uploadBusy ? "pointer-events-none opacity-60" : ""}`}
          >
            <span className="text-sm font-medium text-zinc-200">
              Drop a file here or click to browse
            </span>
            <span className="mt-2 text-xs text-zinc-500">
              {uploadBusy ? "Working…" : null}
            </span>
          </div>
          {uploadError ? (
            <p className="mt-3 text-xs text-red-400">{uploadError}</p>
          ) : null}
          {resumeMeta ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-950/60 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-200">
                  {resumeMeta.originalFileName}
                </p>
                <p className="text-xs text-zinc-500">
                  {formatFileSize(resumeMeta.sizeBytes)} ·{" "}
                  {new Date(resumeMeta.uploadedAt).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void removeResume();
                }}
                disabled={uploadBusy}
                className="shrink-0 rounded-md border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ) : null}
        </section>

        <SkillGapDashboard
          analysis={gapAnalysis}
          analyzing={gapAnalyzing}
          error={gapError}
          ready={gapReady}
          onAnalyze={() => void runGapAnalysis()}
        />

        <InterviewPrepCoach gapSkills={gapAnalysis?.missing ?? []} />

        <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-indigo-300">
          {statusLabel}
        </div>
      </main>
    </div>
  );
}
