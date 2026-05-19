import type { NextConfig } from "next";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

/** Always use this app folder as the Turbopack root (avoids picking ~/pnpm-lock.yaml). */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** Load repo-root `.env.local` when vars are missing (monorepo convenience). */
function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) {
      continue;
    }
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(projectRoot, ".env.local"));
loadEnvFile(path.join(projectRoot, "..", ".env.local"));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  serverExternalPackages: ["pdf-parse", "mammoth", "@napi-rs/canvas"],
  /** Ensure LLM_LAYER_URL from .env.local is visible to API routes in monorepo dev. */
  env: {
    LLM_LAYER_URL: process.env.LLM_LAYER_URL ?? "",
  },
};

export default nextConfig;
