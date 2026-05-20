import type { OAuthProvider } from "@/lib/oauth";

/** Client-safe flags (mirror server env presence via public vars). */
export function isOAuthConfigured(provider: OAuthProvider): boolean {
  if (provider === "github") {
    return process.env.NEXT_PUBLIC_GITHUB_OAUTH_ENABLED === "1";
  }
  return process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "1";
}
