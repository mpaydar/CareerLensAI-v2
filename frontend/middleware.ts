import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getClientIpFromHeaders } from "@/lib/client-ip";
import { getSessionUserIdFromRequest } from "@/lib/session";
import { getUserById } from "@/lib/user-store";
import {
  checkRateLimit,
  getRateLimitIdentifier,
  getUpgradeUrl,
} from "@/lib/usage";

const RATE_LIMITED_PATHS = [
  "/api/optimize",
  "/api/projects/bullet",
  "/api/projects/guide",
  "/api/projects/suggest",
];

function isRateLimitedPath(pathname: string): boolean {
  return RATE_LIMITED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function middleware(request: NextRequest) {
  if (request.method !== "POST") {
    return NextResponse.next();
  }

  if (!isRateLimitedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const userId = getSessionUserIdFromRequest(request);
  const user = userId ? await getUserById(userId) : null;
  const ip = getClientIpFromHeaders(request.headers);
  const identifier = getRateLimitIdentifier(userId, ip);

  const { success, limit, remaining, reset } = await checkRateLimit(
    identifier,
    user,
  );

  if (!success) {
    return NextResponse.json(
      {
        error: "You've used your free AI credits for this month.",
        code: "RATE_LIMIT_EXCEEDED",
        limit,
        remaining,
        reset,
        upgradeUrl: getUpgradeUrl(),
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": String(reset),
        },
      },
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(limit));
  response.headers.set("X-RateLimit-Remaining", String(remaining));
  response.headers.set("X-RateLimit-Reset", String(reset));
  return response;
}

export const config = {
  matcher: [
    "/api/optimize",
    "/api/projects/bullet",
    "/api/projects/guide",
    "/api/projects/suggest",
  ],
};
