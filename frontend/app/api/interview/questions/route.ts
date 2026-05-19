import { NextResponse } from "next/server";
import { generateInterviewPlan } from "@/lib/interview-coach";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { gapSkills?: string[] };
    const gapSkills = Array.isArray(body.gapSkills)
      ? body.gapSkills.filter((s) => typeof s === "string" && s.trim())
      : [];

    if (gapSkills.length === 0) {
      return NextResponse.json(
        { error: "gapSkills array is required" },
        { status: 400 },
      );
    }

    const plan = await generateInterviewPlan(gapSkills);
    return NextResponse.json(plan);
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed to generate questions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
