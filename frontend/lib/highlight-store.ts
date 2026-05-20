import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { extractJobId } from "@/lib/job-id";
import { getRedis } from "@/lib/redis";

export type HighlightState = {
  text: string;
  sourceUrl: string;
  jobId: string;
  updatedAt: string;
};

const HIGHLIGHT_SEPARATOR = "\n\n---\n\n";
export const GLOBAL_HIGHLIGHT_SCOPE = "global";

const defaultState: HighlightState = {
  text: "",
  sourceUrl: "",
  jobId: "",
  updatedAt: "",
};

function redisHighlightKey(scopeId: string): string {
  return `resumesnap:highlight:${scopeId}`;
}

function getStatePath(scopeId: string): string {
  if (scopeId === GLOBAL_HIGHLIGHT_SCOPE) {
    return path.join(process.cwd(), ".highlight-state.json");
  }
  return path.join(process.cwd(), `.highlight-state-${scopeId}.json`);
}

function parseState(raw: string): HighlightState {
  try {
    const parsed = JSON.parse(raw) as Partial<HighlightState>;
    return {
      text: typeof parsed.text === "string" ? parsed.text : "",
      sourceUrl: typeof parsed.sourceUrl === "string" ? parsed.sourceUrl : "",
      jobId: typeof parsed.jobId === "string" ? parsed.jobId : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    };
  } catch {
    return { ...defaultState };
  }
}

async function readStateFromFile(scopeId: string): Promise<HighlightState> {
  try {
    const raw = await readFile(getStatePath(scopeId), "utf8");
    return parseState(raw);
  } catch {
    return { ...defaultState };
  }
}

async function writeStateToFile(
  scopeId: string,
  state: HighlightState,
): Promise<HighlightState> {
  const filePath = getStatePath(scopeId);
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(state), "utf8");
  await rename(tmpPath, filePath);
  return state;
}

async function readState(scopeId: string): Promise<HighlightState> {
  const redis = getRedis();
  if (redis) {
    const stored = await redis.get<HighlightState>(redisHighlightKey(scopeId));
    if (!stored) {
      return { ...defaultState };
    }
    return parseState(JSON.stringify(stored));
  }
  return readStateFromFile(scopeId);
}

function assertHighlightPersistence(): void {
  if (process.env.VERCEL && !getRedis()) {
    throw new Error(
      "Highlights on Vercel require Upstash Redis. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in the Vercel project, then redeploy.",
    );
  }
}

async function writeState(
  scopeId: string,
  state: HighlightState,
): Promise<HighlightState> {
  assertHighlightPersistence();
  const redis = getRedis();
  if (redis) {
    await redis.set(redisHighlightKey(scopeId), state);
    return state;
  }
  return writeStateToFile(scopeId, state);
}

function chunkAlreadyPresent(existing: string, chunk: string): boolean {
  const trimmed = chunk.trim();
  if (!trimmed) {
    return true;
  }
  if (existing.trim() === trimmed) {
    return true;
  }
  return existing
    .split(HIGHLIGHT_SEPARATOR)
    .map((part) => part.trim())
    .includes(trimmed);
}

function appendChunk(existing: string, chunk: string): string {
  const trimmed = chunk.trim();
  if (!trimmed) {
    return existing;
  }
  if (!existing.trim()) {
    return trimmed;
  }
  if (chunkAlreadyPresent(existing, trimmed)) {
    return existing;
  }
  return `${existing.trimEnd()}${HIGHLIGHT_SEPARATOR}${trimmed}`;
}

function shouldReplaceForJobChange(
  current: HighlightState,
  incomingJobId: string,
): boolean {
  if (!current.text.trim()) {
    return false;
  }
  if (!incomingJobId) {
    return false;
  }
  if (!current.jobId) {
    return false;
  }
  return incomingJobId !== current.jobId;
}

export async function getHighlightState(
  scopeId: string = GLOBAL_HIGHLIGHT_SCOPE,
): Promise<HighlightState> {
  return readState(scopeId);
}

/** Append highlight for same job id; replace all text when job id changes. */
export async function appendHighlightChunk(
  chunk: string,
  sourceUrl: string,
  scopeId: string = GLOBAL_HIGHLIGHT_SCOPE,
): Promise<HighlightState> {
  const trimmedChunk = chunk.trim();
  if (!trimmedChunk) {
    return getHighlightState(scopeId);
  }

  const current = await getHighlightState(scopeId);
  const incomingJobId = extractJobId(sourceUrl);

  let nextText: string;
  let nextJobId: string;

  if (shouldReplaceForJobChange(current, incomingJobId)) {
    nextText = trimmedChunk;
    nextJobId = incomingJobId;
  } else if (!current.text.trim()) {
    nextText = trimmedChunk;
    nextJobId = incomingJobId || current.jobId;
  } else {
    nextText = appendChunk(current.text, trimmedChunk);
    nextJobId = incomingJobId || current.jobId;
  }

  const nextState: HighlightState = {
    text: nextText,
    sourceUrl: sourceUrl || current.sourceUrl,
    jobId: nextJobId,
    updatedAt: new Date().toISOString(),
  };

  return writeState(scopeId, nextState);
}

export async function clearHighlightState(
  scopeId: string = GLOBAL_HIGHLIGHT_SCOPE,
): Promise<HighlightState> {
  return writeState(scopeId, { ...defaultState });
}

/** Replace scope state (used to mirror extension global highlight for logged-in users). */
export async function replaceHighlightState(
  scopeId: string,
  state: HighlightState,
): Promise<HighlightState> {
  return writeState(scopeId, state);
}

export function highlightStorageBackend(): "redis" | "file" {
  return getRedis() ? "redis" : "file";
}
