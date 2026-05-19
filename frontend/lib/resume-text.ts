import { readFile } from "fs/promises";
import path from "path";
import { getRedis } from "@/lib/redis";

function resumeTextKey(userId: string): string {
  return `resumesnap:resume-text:${userId}`;
}

export async function getCachedResumeText(userId: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) {
    return null;
  }
  const stored = await redis.get<string>(resumeTextKey(userId));
  if (typeof stored !== "string" || !stored.trim()) {
    return null;
  }
  return stored.trim();
}

export async function saveResumeTextCache(
  userId: string,
  text: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }
  await redis.set(resumeTextKey(userId), text);
}

export async function clearResumeTextCache(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }
  await redis.del(resumeTextKey(userId));
}

async function parsePdfBuffer(buffer: Buffer): Promise<string> {
  // Node/Vercel: pdf.js needs CanvasFactory from pdf-parse/worker (not DOMMatrix).
  await import("pdf-parse/worker");
  const { PDFParse } = await import("pdf-parse");
  const { CanvasFactory } = await import("pdf-parse/worker");

  const parser = new PDFParse({ data: buffer, CanvasFactory });
  try {
    const parsed = await parser.getText();
    const text = (parsed.text ?? "").trim();
    if (!text) {
      throw new Error(
        "Could not extract text from this PDF. Try DOCX or a text-based PDF.",
      );
    }
    return text;
  } finally {
    await parser.destroy();
  }
}

export async function extractResumeTextFromBuffer(
  buffer: Buffer,
  fileNameOrExt: string,
): Promise<string> {
  const ext = fileNameOrExt.startsWith(".")
    ? fileNameOrExt.toLowerCase()
    : path.extname(fileNameOrExt).toLowerCase();

  if (ext === ".pdf") {
    return parsePdfBuffer(buffer);
  }

  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const text = (result.value ?? "").trim();
    if (!text) {
      throw new Error("Could not extract text from this DOCX file.");
    }
    return text;
  }

  if (ext === ".doc") {
    throw new Error(
      "Legacy .doc files are not supported on cloud deploy; upload PDF or DOCX.",
    );
  }

  throw new Error("unsupported resume file type");
}

export async function readResumeText(
  resumePath: string,
  userId?: string,
): Promise<string> {
  if (userId) {
    const cached = await getCachedResumeText(userId);
    if (cached) {
      return cached;
    }
  }

  const buffer = await readFile(resumePath);
  const text = await extractResumeTextFromBuffer(buffer, path.extname(resumePath));

  if (userId) {
    await saveResumeTextCache(userId, text);
  }

  return text;
}
