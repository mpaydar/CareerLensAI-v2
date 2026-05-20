import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getHighlightForSession } from "@/lib/highlight-scope";
import {
  clearGapAnalysis,
  getStoredGapAnalysis,
  saveGapAnalysis,
} from "@/lib/gap-store";
import { jobDescriptionForAnalysis } from "@/lib/job-description";
import { runGapAnalysis } from "@/lib/skills-analyzer";
import {
  ensureResumeFilePath,
  getResumeMeta,
} from "@/lib/resume-upload";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const analysis = await getStoredGapAnalysis(user.id);
    const resumeMeta = await getResumeMeta(user.id);
    const highlight = await getHighlightForSession();

    return NextResponse.json({
      analysis,
      ready: Boolean(resumeMeta && highlight.text.trim().length >= 20),
      resumeMeta,
      highlightPreview: highlight.text.slice(0, 200),
    });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Complete onboarding first" },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const resumeMeta = await getResumeMeta(user.id);
    const highlight = await getHighlightForSession();

    if (!resumeMeta) {
      return NextResponse.json(
        { error: "upload a resume first" },
        { status: 400 },
      );
    }

    let jobDescription = jobDescriptionForAnalysis(highlight.text.trim());
    try {
      const body = (await request.json()) as { jobDescription?: string };
      if (body.jobDescription?.trim()) {
        jobDescription = jobDescriptionForAnalysis(body.jobDescription.trim());
      }
    } catch {
      // use stored highlight when body is empty
    }
    if (jobDescription.length < 20) {
      return NextResponse.json(
        { error: "highlight a job description (at least 20 characters)" },
        { status: 400 },
      );
    }

    const resumePath = await ensureResumeFilePath(user.id, resumeMeta);
    const { analysisEngine, ...analysis } = await runGapAnalysis(
      resumePath,
      jobDescription,
      user.id,
    );

    const stored = await saveGapAnalysis(user.id, analysis, {
      jobDescriptionPreview: jobDescription.slice(0, 280),
      resumeFileName: resumeMeta.originalFileName,
      analysisEngine,
    });

    return NextResponse.json({ analysis: stored, analysisEngine });
  } catch (e) {
    let message = e instanceof Error ? e.message : "analysis failed";
    if (/<html[\s>]/i.test(message) || /<!DOCTYPE/i.test(message)) {
      message =
        "LLM layer returned an HTML error page. Check Azure snapResume is running (visit /health), set Startup Command to bash startup.sh, and restart the app.";
    }
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

export async function DELETE() {
  try {
    const user = await requireAuthenticatedUser();
    await clearGapAnalysis(user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
