import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  deleteResume,
  getResumeMeta,
  saveResumeFromUpload,
} from "@/lib/resume-upload";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const meta = await getResumeMeta(user.id);
    return NextResponse.json({ meta }, { headers: CORS_HEADERS });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { meta: null, error: "Sign in required" },
        { status: 401, headers: CORS_HEADERS },
      );
    }
    if (e instanceof Error && e.message === "ONBOARDING_REQUIRED") {
      return NextResponse.json(
        { meta: null, error: "Complete onboarding first" },
        { status: 403, headers: CORS_HEADERS },
      );
    }
    throw e;
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
      return NextResponse.json(
        { error: "expected file field" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const meta = await saveResumeFromUpload(user.id, file);
    return NextResponse.json({ meta }, { headers: CORS_HEADERS });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Sign in required" },
        { status: 401, headers: CORS_HEADERS },
      );
    }
    if (e instanceof Error && e.message === "ONBOARDING_REQUIRED") {
      return NextResponse.json(
        { error: "Complete onboarding first" },
        { status: 403, headers: CORS_HEADERS },
      );
    }
    const message = e instanceof Error ? e.message : "upload failed";
    return NextResponse.json(
      { error: message },
      { status: 400, headers: CORS_HEADERS },
    );
  }
}

export async function DELETE() {
  try {
    const user = await requireAuthenticatedUser();
    await deleteResume(user.id);
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Sign in required" },
        { status: 401, headers: CORS_HEADERS },
      );
    }
    return NextResponse.json(
      { error: "Could not remove resume" },
      { status: 403, headers: CORS_HEADERS },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
