import { existsSync } from "fs";
import path from "path";

/** Local Python modules (monorepo sibling `llm_layer/skills_service`). */
export const SKILLS_SERVICE_DIR = path.join(
  process.cwd(),
  "..",
  "llm_layer",
  "skills_service",
);

function monorepoVenvPython(): string | null {
  const llmRoot = path.join(process.cwd(), "..", "llm_layer");
  const candidates =
    process.platform === "win32"
      ? [path.join(llmRoot, ".venv", "Scripts", "python.exe")]
      : [
          path.join(llmRoot, ".venv", "bin", "python3"),
          path.join(llmRoot, ".venv", "bin", "python"),
        ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Absolute path to the Python executable for local script spawning.
 * Prefer PYTHON_PATH, then monorepo `llm_layer/.venv`, then PATH.
 */
export function getPythonCommand(): string {
  const fromEnv = process.env.PYTHON_PATH?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.resolve(process.cwd(), fromEnv);
  }

  const venvPython = monorepoVenvPython();
  if (venvPython) {
    return venvPython;
  }

  return process.platform === "win32" ? "python" : "python3";
}

/** False on Vercel/serverless — Python subprocess is not available there. */
export function canSpawnLocalPython(): boolean {
  if (process.env.VERCEL) {
    return false;
  }
  const cmd = getPythonCommand();
  return cmd.includes(path.sep) ? existsSync(cmd) : true;
}

export function llmLayerSetupHint(): string {
  return [
    "SpaCy runs through the LLM layer (recommended), not bare python3 on your PATH.",
    "Add to frontend/.env.local: LLM_LAYER_URL=http://localhost:8000",
    "Then run: cd llm_layer && source .venv/bin/activate && python -m uvicorn app.main:app --reload --port 8000",
    "Restart npm run dev. On Vercel, set LLM_LAYER_URL to your Railway URL.",
  ].join(" ");
}
