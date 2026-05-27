import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getClientIpFromHeaders } from "@/lib/client-ip";
import { getHighlightScopeId } from "@/lib/highlight-scope";
import { getResumeMeta } from "@/lib/resume-upload";
import { getSessionUserId } from "@/lib/session";
import { updateUserProfile } from "@/lib/user-store";
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
      careerFocus: user.careerFocus,
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

export async function PATCH(request: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Sign in with GitHub or Google first." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as {
      careerFocus?: "industrial" | "academic";
    };
    const careerFocus = body?.careerFocus;
    if (careerFocus !== "industrial" && careerFocus !== "academic") {
      return NextResponse.json(
        { error: "Please select a valid role focus." },
        { status: 400 },
      );
    }

    const updated = await updateUserProfile(userId, { careerFocus });
    if (!updated) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: updated.id,
        firstName: updated.firstName,
        lastName: updated.lastName,
        careerFocus: updated.careerFocus,
        plan: updated.plan,
        onboardingComplete: updated.onboardingComplete,
        createdAt: updated.createdAt,
        authProvider: updated.authProvider,
        email: updated.email,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not update account settings." },
      { status: 400 },
    );
  }
}
