import { NextResponse } from "next/server";
import { scoreAnswer } from "@/lib/interview-coach";
import type { AnswerMode } from "@/lib/interview-types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userAnswer?: string;
      idealAnswer?: string;
      mode?: AnswerMode;
    };

    const userAnswer = (body.userAnswer ?? "").trim();
    const idealAnswer = (body.idealAnswer ?? "").trim();
    const mode = body.mode === "type" ? "type" : "voice";

    if (!userAnswer) {
      return NextResponse.json(
        { error: "userAnswer is required" },
        { status: 400 },
      );
    }

    if (!idealAnswer) {
      return NextResponse.json(
        { error: "idealAnswer is required" },
        { status: 400 },
      );
    }

    const { points, maxPoints } = scoreAnswer(userAnswer, idealAnswer, mode);
    return NextResponse.json({ points, maxPoints, mode });
  } catch (e) {
    const message = e instanceof Error ? e.message : "scoring failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
