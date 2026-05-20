"use client";

import { isOAuthConfigured } from "@/lib/oauth-client";

type LoginWelcomeProps = {
  authError?: string | null;
};

export function LoginWelcome({ authError }: LoginWelcomeProps) {
  const githubReady = isOAuthConfigured("github");
  const googleReady = isOAuthConfigured("google");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/95 p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
        <p className="text-xs font-medium uppercase tracking-widest text-indigo-400">
          ResumeSnap
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-50">Sign in</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Use GitHub or Google. New accounts get{" "}
          <strong className="text-zinc-200">3 free AI actions</strong> per month
          (bullet optimization and project ideas). We store your name, sign-in
          provider, and IP for usage limits.
        </p>

        {authError ? (
          <p className="mt-4 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {authError}
          </p>
        ) : null}

        <div className="mt-8 flex flex-col gap-3">
          <a
            href="/api/auth/signin/github"
            className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition ${
              githubReady
                ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                : "cursor-not-allowed bg-zinc-800 text-zinc-500"
            }`}
            aria-disabled={!githubReady}
            onClick={(e) => {
              if (!githubReady) {
                e.preventDefault();
              }
            }}
          >
            Continue with GitHub
          </a>
          <a
            href="/api/auth/signin/google"
            className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition ${
              googleReady
                ? "border-zinc-600 bg-zinc-950 text-zinc-100 hover:bg-zinc-800"
                : "cursor-not-allowed border-zinc-800 text-zinc-600"
            }`}
            aria-disabled={!googleReady}
            onClick={(e) => {
              if (!googleReady) {
                e.preventDefault();
              }
            }}
          >
            Continue with Google
          </a>
        </div>

        {!githubReady && !googleReady ? (
          <p className="mt-4 text-xs text-amber-400/90">
            OAuth is not configured. Set GITHUB_* and GOOGLE_* env vars on
            Vercel (see frontend README).
          </p>
        ) : null}
      </div>
    </div>
  );
}
