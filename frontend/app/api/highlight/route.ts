import { NextResponse } from "next/server";
import {
  appendHighlightChunk,
  clearHighlightState,
  GLOBAL_HIGHLIGHT_SCOPE,
} from "@/lib/highlight-store";
import { getHighlightForSession, getHighlightScopeId } from "@/lib/highlight-scope";
import { getAuthenticatedUser } from "@/lib/auth";
import { clearGapAnalysis } from "@/lib/gap-store";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-ResumeSnap-Source",
};

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

function isExtensionRequest(request: Request): boolean {
  return request.headers.get("x-resumesnap-source") === "extension";
}

export async function GET() {
  const state = await getHighlightForSession();
  return NextResponse.json(state, {
    headers: { ...CORS_HEADERS, ...NO_CACHE_HEADERS },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text?: string;
      sourceUrl?: string;
    };

    const text = (body.text ?? "").trim();
    const sourceUrl = (body.sourceUrl ?? "").trim();

    if (!text) {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const globalState = await appendHighlightChunk(
      text,
      sourceUrl,
      GLOBAL_HIGHLIGHT_SCOPE,
    );

    // Extension: global only (even if a session cookie is accidentally sent).
    if (isExtensionRequest(request)) {
      return NextResponse.json(globalState, {
        headers: { ...CORS_HEADERS, ...NO_CACHE_HEADERS },
      });
    }

    const scopeId = await getHighlightScopeId();
    if (scopeId === GLOBAL_HIGHLIGHT_SCOPE) {
      return NextResponse.json(globalState, {
        headers: { ...CORS_HEADERS, ...NO_CACHE_HEADERS },
      });
    }

    const userState = await appendHighlightChunk(text, sourceUrl, scopeId);
    const state =
      Date.parse(userState.updatedAt) >= Date.parse(globalState.updatedAt)
        ? userState
        : globalState;

    return NextResponse.json(state, {
      headers: { ...CORS_HEADERS, ...NO_CACHE_HEADERS },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "highlight save failed";
    const status = /redis|upstash/i.test(message) ? 503 : 400;
    return NextResponse.json(
      { error: message },
      { status, headers: CORS_HEADERS },
    );
  }
}

export async function DELETE() {
  const scopeId = await getHighlightScopeId();
  // Extension POSTs without session cookies → global scope. Clear both so GET
  // does not fall back to stale global text after a logged-in user clears.
  await clearHighlightState(GLOBAL_HIGHLIGHT_SCOPE);
  if (scopeId !== GLOBAL_HIGHLIGHT_SCOPE) {
    await clearHighlightState(scopeId);
  }
  const state = await getHighlightForSession();
  const user = await getAuthenticatedUser();
  if (user) {
    await clearGapAnalysis(user.id);
  }
  return NextResponse.json(state, { headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
