import { NextResponse } from "next/server";
import { transcribeAudioBuffer } from "@/lib/interview-coach";

export async function POST(request: Request) {
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

    const name = file.name || "answer.webm";
    const text = await transcribeAudioBuffer(buffer, name);
    return NextResponse.json({ text });
  } catch (e) {
    let message = e instanceof Error ? e.message : "transcription failed";
    if (/ffmpeg/i.test(message) && /no such file/i.test(message)) {
      message =
        "Whisper on Railway needs ffmpeg. Redeploy the llm_layer service after confirming /health shows ffmpeg installed.";
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
