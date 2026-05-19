import { getRedis } from "@/lib/redis";

export type ApplicationRecord = {
  jobId: string;
  sourceUrl: string;
  appliedAt: string;
  method: "easy_apply_heuristic";
};

export const GLOBAL_APPLICATIONS_SCOPE = "global";

const MAX_RECORDS = 40;

function redisKey(scopeId: string): string {
  return `resumesnap:applications:${scopeId}`;
}

function parseRecords(raw: unknown): ApplicationRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Partial<ApplicationRecord>;
      return {
        jobId: String(row.jobId ?? "").trim(),
        sourceUrl: String(row.sourceUrl ?? "").trim(),
        appliedAt: String(row.appliedAt ?? "").trim(),
        method: "easy_apply_heuristic" as const,
      };
    })
    .filter((row) => row.jobId && row.appliedAt);
}

export async function getApplications(
  scopeId: string,
): Promise<ApplicationRecord[]> {
  const redis = getRedis();
  if (!redis) {
    return [];
  }
  const stored = await redis.get<ApplicationRecord[]>(redisKey(scopeId));
  return parseRecords(stored);
}

export async function recordApplication(
  scopeId: string,
  record: ApplicationRecord,
): Promise<ApplicationRecord[]> {
  const redis = getRedis();
  if (!redis) {
    return [record];
  }

  const existing = await getApplications(scopeId);
  const withoutDup = existing.filter((r) => r.jobId !== record.jobId);
  const next = [record, ...withoutDup].slice(0, MAX_RECORDS);
  await redis.set(redisKey(scopeId), next);
  return next;
}
