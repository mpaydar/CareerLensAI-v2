"use client";

import { useAccount } from "@/components/account-provider";
import type { OptimizeMode } from "@/lib/resume-optimizer";
import { useCallback, useEffect, useState } from "react";

type OptimizeResponse = {
  skill: string;
  resumeBullet: string;
  jdSentence: string;
  relatedBullets?: string[];
  optimizedBullet: string;
  mode?: OptimizeMode;
};

type ResumeSkillOptimizerProps = {
  skill: string;
  mode: OptimizeMode;
  neededFor?: string;
  onClose: () => void;
};

export function ResumeSkillOptimizer({
  skill,
  mode,
  neededFor,
  onClose,
}: ResumeSkillOptimizerProps) {
  const { handleRateLimitResponse, refreshAccount } = useAccount();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const headline = "Strengthen this bullet";
  const bulletLabel = "Optimized bullet";

  const runOptimize = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill, mode, neededFor }),
      });
      const data = (await response.json()) as OptimizeResponse & {
        error?: string;
        code?: string;
      };
      if (handleRateLimitResponse(response, data)) {
        return;
      }
      if (!response.ok) {
        throw new Error(data.error ?? "Optimization failed");
      }
      if (!data.optimizedBullet?.trim()) {
        throw new Error("No bullet was generated. Try again.");
      }
      setResult(data);
      await refreshAccount();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Optimization failed");
    } finally {
      setLoading(false);
    }
  }, [skill, mode, neededFor, handleRateLimitResponse, refreshAccount]);

  useEffect(() => {
    void runOptimize();
  }, [runOptimize]);

  const handleCopy = async () => {
    const text = result?.optimizedBullet?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="optimizer-title"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">
              {headline}
            </p>
            <h3 id="optimizer-title" className="text-lg font-semibold text-zinc-100">
              {skill}
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Reframes an existing bullet to better match the job.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {loading ? (
            <p className="text-sm text-indigo-300">
              Optimizing with targeted context…
            </p>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
              <button
                type="button"
                onClick={() => void runOptimize()}
                className="mt-2 block text-xs text-red-200 underline"
              >
                Try again
              </button>
            </div>
          ) : null}

          {result ? (
            <>
              <details className="rounded-lg border border-zinc-800 bg-zinc-950/60 text-xs text-zinc-500">
                <summary className="cursor-pointer px-3 py-2 text-zinc-400">
                  Source context used
                </summary>
                <div className="space-y-3 border-t border-zinc-800 px-3 py-3">
                  {result.relatedBullets?.length ? (
                    <div>
                      <p className="mb-1 font-medium text-zinc-500">
                        Related resume experience
                      </p>
                      <ul className="list-inside list-disc space-y-1 text-zinc-400">
                        {result.relatedBullets.map((bullet) => (
                          <li key={bullet.slice(0, 48)}>{bullet}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div>
                      <p className="mb-1 font-medium text-zinc-500">Resume bullet</p>
                      <p className="text-zinc-400">{result.resumeBullet}</p>
                    </div>
                  )}
                  <div>
                    <p className="mb-1 font-medium text-zinc-500">JD sentence</p>
                    <p className="text-zinc-400">{result.jdSentence}</p>
                  </div>
                </div>
              </details>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-400">
                  {bulletLabel}
                </p>
                <p className="min-h-[4.5rem] rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-3 text-sm leading-relaxed text-zinc-50">
                  {result.optimizedBullet}
                </p>
              </div>
            </>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          {result?.optimizedBullet ? (
            <button
              type="button"
              onClick={() => void handleCopy()}
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
