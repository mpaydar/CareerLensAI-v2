import { NextResponse } from "next/server";
import { authErrorRedirect, resolveOAuthLogin } from "@/lib/auth-session";
import { getClientIpFromHeaders } from "@/lib/client-ip";
import {
  exchangeGithubCode,
  exchangeGoogleCode,
  getAppOrigin,
  verifyOAuthState,
  type OAuthProvider,
} from "@/lib/oauth";
import { setSessionCookie } from "@/lib/session";

const PROVIDERS: OAuthProvider[] = ["github", "google"];

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: raw } = await context.params;
  if (!PROVIDERS.includes(raw as OAuthProvider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  const provider = raw as OAuthProvider;
  const origin = getAppOrigin(request.url);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return authErrorRedirect(origin, `Sign-in cancelled: ${oauthError}`);
  }
  if (!code || !state || !verifyOAuthState(state, provider)) {
    return authErrorRedirect(origin, "Invalid or expired sign-in session.");
  }

  try {
    const profile =
      provider === "github"
        ? await exchangeGithubCode(code, origin)
        : await exchangeGoogleCode(code, origin);

    const ip = getClientIpFromHeaders(request.headers);
    const user = await resolveOAuthLogin(provider, profile, ip);

    const response = NextResponse.redirect(new URL("/", origin));
    setSessionCookie(response, user.id);
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sign-in failed";
    return authErrorRedirect(origin, message);
  }
}
