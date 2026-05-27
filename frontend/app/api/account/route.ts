import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getClientIpFromHeaders } from "@/lib/client-ip";
import { getHighlightScopeId } from "@/lib/highlight-scope";
import { getResumeMeta } from "@/lib/resume-upload";
import { getSessionUserId } from "@/lib/session";
import {
  FREE_AI_LIMIT,
  getRateLimitIdentifier,
  getUpgradeUrl,
  getUsageStats,
} from "@/lib/usage";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  const userId = await getSessionUserId();
  const ip = getClientIpFromHeaders(request.headers);
  const identifier = getRateLimitIdentifier(userId, ip);
  const usage = await getUsageStats(identifier);

  if (!user) {
    return NextResponse.json({
      user: null,
      resume: null,
      usage: usage ?? {
        limit: FREE_AI_LIMIT,
        remaining: FREE_AI_LIMIT,
        reset: Date.now(),
        used: 0,
      },
      upgradeUrl: getUpgradeUrl(),
    });
  }

  const resume = await getResumeMeta(user.id);

  return NextResponse.json({
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      careerFocus: user.careerFocus ?? "industrial",
      plan: user.plan,
      onboardingComplete: user.onboardingComplete,
      createdAt: user.createdAt,
      authProvider: user.authProvider,
      email: user.email,
    },
    resume,
    usage: usage ?? {
      limit: FREE_AI_LIMIT,
      remaining: user.plan === "pro" ? FREE_AI_LIMIT : 0,
      reset: Date.now(),
      used: 0,
    },
    upgradeUrl: getUpgradeUrl(),
    highlightScopeId: await getHighlightScopeId(),
  });
}
