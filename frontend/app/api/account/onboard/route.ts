import { NextResponse } from "next/server";
import { saveResumeFromUpload } from "@/lib/resume-upload";
import { getSessionUserId } from "@/lib/session";
import {
  completeOnboarding,
  getUserById,
  updateUserProfile,
} from "@/lib/user-store";

export async function POST(request: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Sign in with GitHub or Google first." },
        { status: 401 },
      );
    }

    const existing = await getUserById(userId);
    if (!existing) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    if (existing.onboardingComplete) {
      return NextResponse.json(
        { error: "Onboarding already completed." },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const file = formData.get("file");

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "First and last name are required." },
        { status: 400 },
      );
    }

    if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
      return NextResponse.json(
        { error: "Please upload your resume (PDF or Word)." },
        { status: 400 },
      );
    }

    await updateUserProfile(userId, { firstName, lastName });
    const meta = await saveResumeFromUpload(userId, file);
    const completed = await completeOnboarding(userId);

    if (!completed) {
      return NextResponse.json(
        { error: "Could not finish setting up your account." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      user: {
        id: completed.id,
        firstName: completed.firstName,
        lastName: completed.lastName,
        plan: completed.plan,
        onboardingComplete: completed.onboardingComplete,
        createdAt: completed.createdAt,
        authProvider: completed.authProvider,
      },
      resume: meta,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not finish onboarding.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
