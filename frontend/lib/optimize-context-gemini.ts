import type { OptimizeContext } from "@/lib/resume-optimizer";
import { callGemini } from "@/lib/gemini-client";
import { parseJsonFromModel } from "@/lib/json-parse";

const SYSTEM = `You pick resume optimization context. Return ONLY JSON with:
resumeBullet (string), jdSentence (string), relatedBullets (string[]), bulletMentionsSkill (boolean).`;

export async function pickOptimizeContextGemini(
  resumeText: string,
  jobDescription: string,
  skill: string,
): Promise<OptimizeContext> {
  const userPrompt = [
    `TARGET SKILL: ${skill}`,
    "",
    "RESUME:",
    resumeText.slice(0, 20_000),
    "",
    "JOB DESCRIPTION:",
    jobDescription.slice(0, 10_000),
    "",
    "Pick the best existing resume bullet to reframe for this skill, and the most relevant JD sentence.",
  ].join("\n");

  const raw = await callGemini({
    systemInstruction: SYSTEM,
    userPrompt,
    jsonMode: true,
    maxOutputTokens: 1024,
    temperature: 0.25,
  });

  const parsed = parseJsonFromModel<{
    resumeBullet?: string;
    jdSentence?: string;
    relatedBullets?: string[];
    bulletMentionsSkill?: boolean;
  }>(raw);

  const resumeBullet = String(parsed.resumeBullet ?? "").trim();
  const relatedBullets = Array.isArray(parsed.relatedBullets)
    ? parsed.relatedBullets.map((b) => String(b).trim()).filter(Boolean)
    : [];

  return {
    skill,
    resumeBullet,
    jdSentence: String(parsed.jdSentence ?? "").trim(),
    relatedBullets:
      relatedBullets.length > 0
        ? relatedBullets
        : resumeBullet
          ? [resumeBullet]
          : [],
    bulletMentionsSkill: Boolean(parsed.bulletMentionsSkill),
  };
}
