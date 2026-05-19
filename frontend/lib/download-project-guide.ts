import type { SkillProjectSuggestion } from "@/lib/skill-projects";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToPrintHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const blocks: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed) {
      blocks.push("<p class=\"spacer\"></p>");
      continue;
    }
    if (trimmed.startsWith("### ")) {
      blocks.push(`<h3>${escapeHtml(trimmed.slice(4))}</h3>`);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push(`<h2>${escapeHtml(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith("# ")) {
      blocks.push(`<h1>${escapeHtml(trimmed.slice(2))}</h1>`);
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      blocks.push(`<li>${escapeHtml(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    blocks.push(`<p>${escapeHtml(trimmed)}</p>`);
  }

  return blocks.join("\n");
}

export function downloadProjectGuidePdf(
  skill: string,
  project: SkillProjectSuggestion,
): void {
  if (!project.instructionGuide.trim()) {
    return;
  }

  const body = markdownToPrintHtml(project.instructionGuide);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(project.title)} — ${escapeHtml(skill)}</title>
  <style>
    @page { margin: 1in; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 11pt;
      line-height: 1.55;
      color: #111;
      max-width: 7in;
      margin: 0 auto;
      padding: 24px;
    }
    h1 { font-size: 18pt; margin: 0 0 8px; }
    h2 { font-size: 13pt; margin: 20px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    h3 { font-size: 11.5pt; margin: 16px 0 6px; }
    .meta { font-size: 10pt; color: #444; margin-bottom: 24px; }
    p { margin: 0 0 8px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(project.title)}</h1>
  <p class="meta">
    Skill: ${escapeHtml(skill)} · ~${project.estimatedHours}h ·
    ~${project.gapCoveragePercent}% gap coverage<br />
    ${escapeHtml(project.summary)}
  </p>
  ${body}
  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error("Allow pop-ups to download the PDF, then try again.");
  }
  win.addEventListener("afterprint", () => URL.revokeObjectURL(url));
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
