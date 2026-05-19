import { readFile } from "fs/promises";
import path from "path";

export async function readResumeText(resumePath: string): Promise<string> {
  const ext = path.extname(resumePath).toLowerCase();
  const buffer = await readFile(resumePath);

  if (ext === ".pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      return (parsed.text ?? "").trim();
    } finally {
      await parser.destroy();
    }
  }

  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return (result.value ?? "").trim();
  }

  if (ext === ".doc") {
    throw new Error(
      "Legacy .doc files are not supported on cloud deploy; upload PDF or DOCX.",
    );
  }

  throw new Error("unsupported resume file type");
}
