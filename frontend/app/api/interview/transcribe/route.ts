import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { transcribeAudioFile } from "@/lib/interview-coach";

const UPLOAD_DIR = process.env.VERCEL
  ? path.join("/tmp", "resumesnap-interview-audio")
  : path.join(process.cwd(), ".interview-audio");

export async function POST(request: Request) {
  let tempPath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("audio");

    if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
      return NextResponse.json(
        { error: "expected audio file" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json({ error: "empty audio file" }, { status: 400 });
    }

    if (buffer.length > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "audio too large (max 25 MB)" },
        { status: 400 },
      );
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    const ext = file.name?.endsWith(".wav") ? ".wav" : ".webm";
    tempPath = path.join(UPLOAD_DIR, `clip-${Date.now()}${ext}`);
    await writeFile(tempPath, buffer);

    const text = await transcribeAudioFile(tempPath);
    return NextResponse.json({ text });
  } catch (e) {
    let message = e instanceof Error ? e.message : "transcription failed";
    if (/ffmpeg/i.test(message) && /no such file/i.test(message)) {
      message =
        "ffmpeg is not installed. Run: brew install ffmpeg — then restart the LLM layer (uvicorn).";
    }
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tempPath) {
      await unlink(tempPath).catch(() => {});
    }
  }
}
