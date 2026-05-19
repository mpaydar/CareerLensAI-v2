import { NextResponse } from "next/server";
import { saveResumeFromUpload } from "@/lib/resume-upload";
import { setSessionCookie } from "@/lib/session";
import { completeOnboarding, createUser } from "@/lib/user-store";

export async function POST(request: Request) {
  try {
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

    const user = await createUser({ firstName, lastName });
    const meta = await saveResumeFromUpload(user.id, file);
    const completed = await completeOnboarding(user.id);

    if (!completed) {
      return NextResponse.json(
        { error: "Could not finish setting up your account." },
        { status: 500 },
      );
    }

    const response = NextResponse.json({
      user: {
        id: completed.id,
        firstName: completed.firstName,
        lastName: completed.lastName,
        plan: completed.plan,
        onboardingComplete: completed.onboardingComplete,
        createdAt: completed.createdAt,
      },
      resume: meta,
    });

    setSessionCookie(response, completed.id);
    return response;
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not create your account.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
