import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getHighlightForSession } from "@/lib/highlight-scope";
import {
  optimizeResumeBullet,
  type OptimizeMode,
} from "@/lib/resume-optimizer";
import {
  ensureResumeFilePath,
  getResumeMeta,
} from "@/lib/resume-upload";
export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const body = (await request.json()) as {
      skill?: string;
      mode?: OptimizeMode;
      neededFor?: string;
    };
    const skill = typeof body.skill === "string" ? body.skill.trim() : "";
    const mode =
      body.mode === "missing" || body.mode === "reframe" ? body.mode : undefined;
    const neededFor =
      typeof body.neededFor === "string" ? body.neededFor.trim() : undefined;

    if (!skill) {
      return NextResponse.json({ error: "skill is required" }, { status: 400 });
    }

    const resumeMeta = await getResumeMeta(user.id);
    if (!resumeMeta) {
      return NextResponse.json(
        { error: "upload a resume first" },
        { status: 400 },
      );
    }

    const highlight = await getHighlightForSession();
    const jobDescription = highlight.text.trim();
    if (jobDescription.length < 20) {
      return NextResponse.json(
        { error: "highlight a job description first" },
        { status: 400 },
      );
    }

    const resumePath = await ensureResumeFilePath(user.id, resumeMeta);
    const result = await optimizeResumeBullet(
      resumePath,
      jobDescription,
      skill,
      { mode, neededFor },
    );

    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "failed to optimize resume bullet";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    if (message === "ONBOARDING_REQUIRED") {
      return NextResponse.json(
        { error: "Complete onboarding first" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
