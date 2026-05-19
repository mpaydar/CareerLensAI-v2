import { readFile, writeFile, unlink } from "fs/promises";
import path from "path";
import type { GapAnalysis } from "@/lib/gap-analysis-types";
import type { StoredGapAnalysis } from "@/lib/gap-types";
import { getRedis } from "@/lib/redis";

export type { StoredGapAnalysis } from "@/lib/gap-types";

function gapRedisKey(userId: string): string {
  return `resumesnap:gap-analysis:${userId}`;
}

function getGapFilePath(userId: string): string {
  const base = process.env.VERCEL
    ? path.join("/tmp", "resumesnap-gap")
    : process.cwd();
  return path.join(base, `.gap-analysis-${userId}.json`);
}

export async function getStoredGapAnalysis(
  userId: string,
): Promise<StoredGapAnalysis | null> {
  const redis = getRedis();
  if (redis) {
    const stored = await redis.get<StoredGapAnalysis>(gapRedisKey(userId));
    if (stored) {
      return stored;
    }
  }

  try {
    const raw = await readFile(getGapFilePath(userId), "utf8");
    return JSON.parse(raw) as StoredGapAnalysis;
  } catch {
    return null;
  }
}

export async function saveGapAnalysis(
  userId: string,
  analysis: GapAnalysis,
  meta: { jobDescriptionPreview: string; resumeFileName: string },
): Promise<StoredGapAnalysis> {
  const stored: StoredGapAnalysis = {
    ...analysis,
    ...meta,
  };

  const redis = getRedis();
  if (redis) {
    await redis.set(gapRedisKey(userId), stored);
    return stored;
  }

  await writeFile(getGapFilePath(userId), JSON.stringify(stored, null, 0), "utf8");
  return stored;
}

export async function clearGapAnalysis(userId: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.del(gapRedisKey(userId));
  }
  try {
    await unlink(getGapFilePath(userId));
  } catch {
    // ignore
  }
}
