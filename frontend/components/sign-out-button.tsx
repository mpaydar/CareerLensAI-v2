"use client";

import { useState } from "react";

type SignOutButtonProps = {
  className?: string;
  variant?: "link" | "button";
};

export async function signOut(): Promise<void> {
  await fetch("/api/auth/signout", { method: "POST", credentials: "same-origin" });
  window.location.href = "/";
}

export function SignOutButton({
  className = "",
  variant = "button",
}: SignOutButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleClick = () => {
    setBusy(true);
    void signOut().catch(() => {
      setBusy(false);
    });
  };

  if (variant === "link") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={handleClick}
        className={`text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline disabled:opacity-50 ${className}`}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={handleClick}
      className={`rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
