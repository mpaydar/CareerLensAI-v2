import path from "path";

/** Local Python modules (monorepo sibling `llm_layer/skills_service`). */
export const SKILLS_SERVICE_DIR = path.join(
  process.cwd(),
  "..",
  "llm_layer",
  "skills_service",
);

/**
 * Absolute path to the Python executable for local script spawning.
 * Set PYTHON_PATH in npm scripts — do not reference .venv paths in imports
 * (Turbopack follows those symlinks and breaks the bundle).
 */
export function getPythonCommand(): string {
  const fromEnv = process.env.PYTHON_PATH?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.resolve(process.cwd(), fromEnv);
  }
  return process.platform === "win32" ? "python" : "python3";
}
