import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { resolveProjectRequest } from "@/lib/project-request";
import {
  generateProjectGuide,
  type ProjectMeta,
} from "@/lib/skill-projects";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const body = (await request.json()) as {
      skill?: string;
      skills?: string[];
      neededFor?: string;
      contextSummary?: string;
      clusterLabel?: string;
      clusterKind?: "technical" | "domain" | "soft";
      project?: ProjectMeta;
    };

    const skills =
      Array.isArray(body.skills) && body.skills.length > 0
        ? body.skills
        : body.skill
          ? [body.skill]
          : [];

    const { resumePath, jobDescription, neededFor, clusterLabel, clusterKind } =
      await resolveProjectRequest(
        user,
        skills,
        body.contextSummary ?? body.neededFor,
        {
          clusterLabel: body.clusterLabel,
          clusterKind: body.clusterKind,
        },
      );

    if (!body.project?.id || !body.project.title) {
      return NextResponse.json(
        { error: "project metadata is required" },
        { status: 400 },
      );
    }

    const result = await generateProjectGuide(
      resumePath,
      jobDescription,
      { skills, clusterLabel, clusterKind, neededFor },
      body.project,
    );

    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "failed to generate project guide";
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
