import { NextResponse } from "next/server";
import {
  getAppOrigin,
  githubAuthorizeUrl,
  googleAuthorizeUrl,
  isOAuthConfigured,
  signOAuthState,
  type OAuthProvider,
} from "@/lib/oauth";

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

  if (!isOAuthConfigured(provider)) {
    return NextResponse.json(
      { error: `${provider} OAuth is not configured on the server.` },
      { status: 503 },
    );
  }

  try {
    const origin = getAppOrigin(request.url);
    const state = signOAuthState(provider);
    const url =
      provider === "github"
        ? githubAuthorizeUrl(origin, state)
        : googleAuthorizeUrl(origin, state);
    return NextResponse.redirect(url);
  } catch (e) {
    const message = e instanceof Error ? e.message : "OAuth failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
