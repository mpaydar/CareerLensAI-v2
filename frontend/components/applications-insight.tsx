"use client";

import type { ApplicationRecord } from "@/lib/application-store";
import { useCallback, useEffect, useState } from "react";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function jobLink(record: ApplicationRecord): string | null {
  if (record.sourceUrl) {
    return record.sourceUrl;
  }
  return `https://www.linkedin.com/jobs/view/${record.jobId}`;
}

export function ApplicationsInsight({
  currentJobId,
}: {
  currentJobId?: string;
}) {
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/applications", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as {
        applications?: ApplicationRecord[];
      };
      setApplications(data.applications ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(intervalId);
  }, [refresh]);

  const justAppliedCurrent =
    currentJobId &&
    applications.some(
      (a) =>
        a.jobId === currentJobId &&
        Date.now() - new Date(a.appliedAt).getTime() < 15 * 60 * 1000,
    );

  if (loading && applications.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm uppercase tracking-wide text-emerald-400">
          Applications detected
        </h2>
        <span className="text-xs text-emerald-600/80">
          Easy Apply heuristic · extension
        </span>
      </div>

      {justAppliedCurrent ? (
        <p className="mt-2 text-sm text-emerald-200">
          Likely submitted an application for this job (LinkedIn Easy Apply
          pattern detected).
        </p>
      ) : (
        <p className="mt-2 text-sm text-zinc-400">
          When you finish LinkedIn Easy Apply (form fields → Submit), we log it
          here automatically.
        </p>
      )}

      {applications.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">
          No applications logged yet. Complete an Easy Apply flow on LinkedIn
          while this dashboard is open.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {applications.slice(0, 8).map((record) => {
            const href = jobLink(record);
            const isCurrent = currentJobId && record.jobId === currentJobId;
            return (
              <li
                key={`${record.jobId}-${record.appliedAt}`}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                  isCurrent
                    ? "border-emerald-600/50 bg-emerald-900/20"
                    : "border-zinc-800 bg-zinc-950/60"
                }`}
              >
                <div>
                  <p className="font-medium text-zinc-200">
                    Job {record.jobId}
                    {isCurrent ? (
                      <span className="ml-2 text-xs text-emerald-400">
                        current
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatWhen(record.appliedAt)}
                  </p>
                </div>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    View on LinkedIn
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
