"use client";

import type { UsageStats } from "@/lib/account-types";

type UpgradeModalProps = {
  open: boolean;
  onClose: () => void;
  usage: UsageStats;
  upgradeUrl: string;
  message?: string;
};

function formatReset(reset: number): string {
  return new Date(reset).toLocaleDateString(undefined, {
    weekday: "short",
    month: "long",
    day: "numeric",
  });
}

export function UpgradeModal({
  open,
  onClose,
  usage,
  upgradeUrl,
  message,
}: UpgradeModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
        <p className="text-xs font-medium uppercase tracking-widest text-indigo-400">
          ResumeSnap Pro
        </p>
        <h2 id="upgrade-title" className="mt-2 text-xl font-semibold text-zinc-50">
          Keep tailoring with AI
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          {message ??
            "You've used your 3 free AI actions for this month. Upgrade for unlimited bullet optimization and project suggestions."}
        </p>

        <div className="mt-5 rounded-lg border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-300">
          <p>
            <span className="text-zinc-500">Free plan: </span>
            {usage.used} of {usage.limit} used
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Resets {formatReset(usage.reset)}
          </p>
        </div>

        <ul className="mt-5 space-y-2 text-sm text-zinc-400">
          <li>Unlimited AI resume bullet rewrites</li>
          <li>Unlimited project ideas and guides</li>
          <li>Skill gap analysis stays included</li>
        </ul>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={upgradeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Upgrade now
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-600 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
