"use client";

import { useAccount } from "@/components/account-provider";

function formatReset(reset: number): string {
  if (!reset) {
    return "soon";
  }
  return new Date(reset).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function UsageBanner() {
  const { user, usage, showUpgrade } = useAccount();

  if (!user?.onboardingComplete) {
    return null;
  }

  if (user.plan === "pro") {
    return (
      <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
        Pro plan — unlimited AI features. Thanks for supporting ResumeSnap!
      </div>
    );
  }

  const exhausted = usage.remaining <= 0;

  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        exhausted
          ? "border-amber-800/60 bg-amber-950/40 text-amber-100"
          : "border-indigo-900/50 bg-indigo-950/30 text-indigo-100"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">
            Hi {user.firstName}!{" "}
            {exhausted
              ? "You've used all your free AI credits this month."
              : `You have ${usage.remaining} of ${usage.limit} free AI actions left.`}
          </p>
          <p className="mt-1 text-xs opacity-80">
            {exhausted
              ? `Credits reset on ${formatReset(usage.reset)}. Upgrade for unlimited optimize & project ideas.`
              : "Uses bullet optimization and project suggestions. Highlights & skill gap analysis are always free."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => showUpgrade()}
          className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold transition ${
            exhausted
              ? "bg-amber-500 text-amber-950 hover:bg-amber-400"
              : "bg-indigo-600 text-white hover:bg-indigo-500"
          }`}
        >
          {exhausted ? "Upgrade to continue" : "View plans"}
        </button>
      </div>
    </div>
  );
}
