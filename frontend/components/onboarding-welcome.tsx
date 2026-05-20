"use client";

import { useAccount } from "@/components/account-provider";
import { SignOutButton } from "@/components/sign-out-button";
import { useEffect, useState } from "react";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OnboardingWelcome() {
  const { user, refreshAccount } = useAccount();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
    }
  }, [user]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    if (!file) {
      setError("Please upload your resume to continue.");
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.set("firstName", firstName.trim());
      body.set("lastName", lastName.trim());
      body.set("file", file);

      const response = await fetch("/api/account/onboard", {
        method: "POST",
        body,
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      await refreshAccount();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/95 p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
        <div className="absolute right-6 top-6">
          <SignOutButton />
        </div>
        <p className="text-xs font-medium uppercase tracking-widest text-indigo-400">
          Almost there
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-50">
          Upload your resume
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          {user?.authProvider ? (
            <>
              Signed in with{" "}
              <span className="capitalize text-zinc-200">
                {user.authProvider}
              </span>
              . Confirm your name and add the resume you want to tailor.
            </>
          ) : (
            <>
              Confirm your name and upload the resume you want to tailor.
            </>
          )}
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-zinc-400">First name</span>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-indigo-500/0 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-zinc-400">Last name</span>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-zinc-400">Your resume</span>
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1.5 w-full text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-xs file:font-medium file:text-white hover:file:bg-indigo-500"
            />
            {file ? (
              <p className="mt-2 text-xs text-zinc-500">
                {file.name} · {formatFileSize(file.size)}
              </p>
            ) : (
              <p className="mt-2 text-xs text-zinc-600">PDF or Word, up to 10 MB</p>
            )}
          </label>

          {error ? (
            <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Saving…" : "Continue to dashboard"}
          </button>
        </form>
      </div>
    </div>
  );
}
