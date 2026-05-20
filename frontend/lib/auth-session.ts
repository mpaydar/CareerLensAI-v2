import { NextResponse } from "next/server";
import type { OAuthProvider } from "@/lib/oauth";
import {
  createOAuthUser,
  findUserByOAuth,
  recordUserLogin,
  type User,
} from "@/lib/user-store";

export async function resolveOAuthLogin(
  provider: OAuthProvider,
  profile: {
    providerId: string;
    firstName: string;
    lastName: string;
    email?: string;
  },
  ip: string,
): Promise<User> {
  const existing = await findUserByOAuth(provider, profile.providerId);
  if (existing) {
    const updated = await recordUserLogin(existing.id, ip);
    return updated ?? existing;
  }

  return createOAuthUser({
    provider,
    providerId: profile.providerId,
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    lastLoginIp: ip,
  });
}

export function authErrorRedirect(origin: string, message: string): NextResponse {
  const url = new URL("/", origin);
  url.searchParams.set("auth_error", message.slice(0, 200));
  return NextResponse.redirect(url);
}
