import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export type OAuthProvider = "github" | "google";

const STATE_TTL_MS = 10 * 60 * 1000;

function authSecret(): string {
  const secret =
    process.env.AUTH_SECRET?.trim() ||
    process.env.LLM_LAYER_SECRET?.trim() ||
    "";
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is required for OAuth (set in Vercel / .env.local).",
    );
  }
  return secret;
}

export function getAppOrigin(requestUrl: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  const url = new URL(requestUrl);
  return url.origin;
}

export function signOAuthState(provider: OAuthProvider): string {
  const payload = {
    provider,
    nonce: randomBytes(16).toString("hex"),
    ts: Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", authSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifyOAuthState(
  token: string,
  expectedProvider: OAuthProvider,
): boolean {
  const [body, sig] = token.split(".");
  if (!body || !sig) {
    return false;
  }
  const expectedSig = createHmac("sha256", authSecret())
    .update(body)
    .digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return false;
    }
  } catch {
    return false;
  }
  let payload: { provider?: string; ts?: number };
  try {
    payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as { provider?: string; ts?: number };
  } catch {
    return false;
  }
  if (payload.provider !== expectedProvider || typeof payload.ts !== "number") {
    return false;
  }
  return Date.now() - payload.ts <= STATE_TTL_MS;
}

export function githubAuthorizeUrl(origin: string, state: string): string {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("GITHUB_CLIENT_ID is not configured.");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/callback/github`,
    scope: "read:user user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeGithubCode(
  code: string,
  origin: string,
): Promise<{ providerId: string; firstName: string; lastName: string; email?: string }> {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth is not configured.");
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${origin}/api/auth/callback/github`,
    }),
  });
  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error ?? "GitHub token exchange failed.");
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "ResumeSnap",
    },
  });
  const profile = (await userRes.json()) as {
    id?: number;
    login?: string;
    name?: string | null;
    email?: string | null;
  };
  if (!userRes.ok || profile.id == null) {
    throw new Error("Could not load GitHub profile.");
  }

  const { firstName, lastName } = splitName(
    profile.name?.trim() || profile.login || "GitHub",
  );
  return {
    providerId: String(profile.id),
    firstName,
    lastName,
    email: profile.email?.trim() || undefined,
  };
}

export function googleAuthorizeUrl(origin: string, state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured.");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/callback/google`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(
  code: string,
  origin: string,
): Promise<{ providerId: string; firstName: string; lastName: string; email?: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured.");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${origin}/api/auth/callback/google`,
      grant_type: "authorization_code",
    }),
  });
  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error ?? "Google token exchange failed.");
  }

  const profileRes = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    },
  );
  const profile = (await profileRes.json()) as {
    sub?: string;
    given_name?: string;
    family_name?: string;
    name?: string;
    email?: string;
  };
  if (!profileRes.ok || !profile.sub) {
    throw new Error("Could not load Google profile.");
  }

  let firstName = profile.given_name?.trim() ?? "";
  let lastName = profile.family_name?.trim() ?? "";
  if (!firstName && !lastName && profile.name) {
    const split = splitName(profile.name);
    firstName = split.firstName;
    lastName = split.lastName;
  }
  if (!firstName) {
    firstName = "User";
  }

  return {
    providerId: profile.sub,
    firstName,
    lastName,
    email: profile.email?.trim() || undefined,
  };
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "User", lastName: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function isOAuthConfigured(provider: OAuthProvider): boolean {
  if (provider === "github") {
    return Boolean(
      process.env.GITHUB_CLIENT_ID?.trim() &&
        process.env.GITHUB_CLIENT_SECRET?.trim(),
    );
  }
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}
