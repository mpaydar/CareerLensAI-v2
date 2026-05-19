import {
  GLOBAL_HIGHLIGHT_SCOPE,
  getHighlightState,
  type HighlightState,
} from "@/lib/highlight-store";
import { getSessionUserId } from "@/lib/session";

export async function getHighlightScopeId(): Promise<string> {
  const userId = await getSessionUserId();
  return userId ?? GLOBAL_HIGHLIGHT_SCOPE;
}

/**
 * Live view highlights: the Chrome extension only writes the global scope (no
 * session cookie). Prefer global whenever it has text so logged-in users still
 * see LinkedIn captures instead of a stale per-user copy.
 */
export async function getHighlightForSession(): Promise<HighlightState> {
  const globalState = await getHighlightState(GLOBAL_HIGHLIGHT_SCOPE);
  if (globalState.text.trim()) {
    return globalState;
  }

  const userId = await getSessionUserId();
  if (!userId) {
    return globalState;
  }

  return getHighlightState(userId);
}
