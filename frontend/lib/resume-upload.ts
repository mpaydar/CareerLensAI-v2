import { mkdir, readFile, readdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { clearGapAnalysis } from "@/lib/gap-store";
import { getRedis } from "@/lib/redis";
import {
  clearResumeTextCache,
  extractResumeTextFromBuffer,
  saveResumeTextCache,
} from "@/lib/resume-text";

export type ResumeMeta = {
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  storedFileName: string;
};

const META_FILE = "meta.json";
const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXT = new Set([".pdf", ".doc", ".docx"]);

const MIME_FOR_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function resumeMetaKey(userId: string): string {
  return `resumesnap:resume-meta:${userId}`;
}

function resumeDataKey(userId: string): string {
  return `resumesnap:resume-data:${userId}`;
}

function getLocalUploadRoot(): string {
  if (process.env.VERCEL) {
    return path.join("/tmp", "resumesnap-upload");
  }
  return path.join(process.cwd(), ".resume-upload");
}

function getUserUploadDir(userId: string): string {
  return path.join(getLocalUploadRoot(), userId);
}

function getMetaPath(userId: string): string {
  return path.join(getUserUploadDir(userId), META_FILE);
}

function safeExtension(fileName: string): string | null {
  const ext = path.extname(fileName).toLowerCase();
  return ALLOWED_EXT.has(ext) ? ext : null;
}

async function readResumeMetaFromDisk(
  userId: string,
): Promise<ResumeMeta | null> {
  try {
    const raw = await readFile(getMetaPath(userId), "utf8");
    const parsed = JSON.parse(raw) as Partial<ResumeMeta>;
    if (
      typeof parsed.originalFileName !== "string" ||
      typeof parsed.mimeType !== "string" ||
      typeof parsed.sizeBytes !== "number" ||
      typeof parsed.uploadedAt !== "string" ||
      typeof parsed.storedFileName !== "string"
    ) {
      return null;
    }
    return parsed as ResumeMeta;
  } catch {
    return null;
  }
}

async function readResumeBufferFromDisk(
  userId: string,
  meta: ResumeMeta,
): Promise<Buffer | null> {
  try {
    return await readFile(
      path.join(getUserUploadDir(userId), meta.storedFileName),
    );
  } catch {
    return null;
  }
}

export async function getResumeMeta(userId: string): Promise<ResumeMeta | null> {
  const redis = getRedis();
  if (redis) {
    const stored = await redis.get<ResumeMeta>(resumeMetaKey(userId));
    if (stored) {
      return stored;
    }
  }
  return readResumeMetaFromDisk(userId);
}

async function removeStoredFiles(userId: string): Promise<void> {
  const dir = getUserUploadDir(userId);
  try {
    const names = await readdir(dir);
    for (const name of names) {
      if (name === META_FILE) continue;
      if (name.startsWith("resume-")) {
        await unlink(path.join(dir, name));
      }
    }
  } catch {
    // ignore missing dir
  }
}

async function clearResumeFromRedis(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }
  await redis.del(resumeMetaKey(userId), resumeDataKey(userId));
  await clearResumeTextCache(userId);
}

async function saveResumeToRedis(
  userId: string,
  meta: ResumeMeta,
  buffer: Buffer,
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }
  await redis.set(resumeMetaKey(userId), meta);
  await redis.set(resumeDataKey(userId), buffer.toString("base64"));
}

async function readResumeBufferFromRedis(userId: string): Promise<Buffer | null> {
  const redis = getRedis();
  if (!redis) {
    return null;
  }
  const encoded = await redis.get<string>(resumeDataKey(userId));
  if (!encoded || typeof encoded !== "string") {
    return null;
  }
  return Buffer.from(encoded, "base64");
}

async function saveResumeToDisk(
  userId: string,
  meta: ResumeMeta,
  buffer: Buffer,
): Promise<void> {
  const uploadDir = getUserUploadDir(userId);
  await mkdir(uploadDir, { recursive: true });
  await removeStoredFiles(userId);
  await writeFile(path.join(uploadDir, meta.storedFileName), buffer);
  await writeFile(getMetaPath(userId), JSON.stringify(meta, null, 0), "utf8");
}

export async function saveResumeFromUpload(
  userId: string,
  file: File,
): Promise<ResumeMeta> {
  const ext = safeExtension(file.name);
  if (!ext) {
    throw new Error("invalid file type; use PDF, DOC, or DOCX");
  }

  if (file.size > MAX_BYTES) {
    throw new Error(`file too large (max ${MAX_BYTES / (1024 * 1024)} MB)`);
  }

  const declaredMime = file.type || MIME_FOR_EXT[ext];
  const allowedMime = new Set(Object.values(MIME_FOR_EXT));
  if (
    declaredMime &&
    declaredMime !== "application/octet-stream" &&
    !allowedMime.has(declaredMime)
  ) {
    throw new Error("invalid file type");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extractedText = await extractResumeTextFromBuffer(buffer, ext);

  const meta: ResumeMeta = {
    originalFileName: file.name,
    mimeType: MIME_FOR_EXT[ext],
    sizeBytes: buffer.length,
    uploadedAt: new Date().toISOString(),
    storedFileName: `resume-${Date.now()}${ext}`,
  };

  await clearResumeFromRedis(userId);
  await saveResumeToRedis(userId, meta, buffer);
  await saveResumeTextCache(userId, extractedText);

  if (!getRedis()) {
    await saveResumeToDisk(userId, meta, buffer);
  }

  await clearGapAnalysis(userId);
  return meta;
}

/** Local path for Python / file-based tools; materializes from Redis on serverless. */
export async function ensureResumeFilePath(
  userId: string,
  meta: ResumeMeta,
): Promise<string> {
  const localPath = path.join(getUserUploadDir(userId), meta.storedFileName);

  try {
    await readFile(localPath);
    return localPath;
  } catch {
    // materialize below
  }

  let buffer =
    (await readResumeBufferFromRedis(userId)) ??
    (await readResumeBufferFromDisk(userId, meta));

  if (!buffer) {
    throw new Error("resume file not found; upload your resume again");
  }

  const uploadDir = getUserUploadDir(userId);
  await mkdir(uploadDir, { recursive: true });
  await writeFile(localPath, buffer);
  return localPath;
}

/** @deprecated Use ensureResumeFilePath — sync path is unreliable on Vercel */
export function getResumeFilePath(userId: string, meta: ResumeMeta): string {
  return path.join(getUserUploadDir(userId), meta.storedFileName);
}

export async function deleteResume(userId: string): Promise<void> {
  const meta = await getResumeMeta(userId);
  await clearResumeFromRedis(userId);
  try {
    if (meta) {
      await unlink(path.join(getUserUploadDir(userId), meta.storedFileName)).catch(
        () => {},
      );
    }
    await unlink(getMetaPath(userId)).catch(() => {});
  } catch {
    // ignore
  }
  await removeStoredFiles(userId);
  await clearGapAnalysis(userId);
}
