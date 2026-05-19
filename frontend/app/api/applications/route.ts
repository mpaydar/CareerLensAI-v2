import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  GLOBAL_APPLICATIONS_SCOPE,
  recordApplication,
  type ApplicationRecord,
} from "@/lib/application-store";
import { getApplicationsForSession } from "@/lib/application-scope";
import { getHighlightScopeId } from "@/lib/highlight-scope";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function GET() {
  try {
    await requireAuthenticatedUser();
    const applications = await getApplicationsForSession();
    return NextResponse.json({ applications }, { headers: CORS_HEADERS });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Sign in required" },
        { status: 401, headers: CORS_HEADERS },
      );
    }
    return NextResponse.json(
      { error: "Could not load applications" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      jobId?: string;
      sourceUrl?: string;
      appliedAt?: string;
    };

    const jobId = (body.jobId ?? "").trim();
    const sourceUrl = (body.sourceUrl ?? "").trim();
    const appliedAt = (body.appliedAt ?? new Date().toISOString()).trim();

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const record: ApplicationRecord = {
      jobId,
      sourceUrl,
      appliedAt,
      method: "easy_apply_heuristic",
    };

    const scopeId = await getHighlightScopeId();
    await recordApplication(scopeId, record);
    if (scopeId !== GLOBAL_APPLICATIONS_SCOPE) {
      await recordApplication(GLOBAL_APPLICATIONS_SCOPE, record);
    }

    return NextResponse.json({ ok: true, record }, { headers: CORS_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "invalid request body" },
      { status: 400, headers: CORS_HEADERS },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
