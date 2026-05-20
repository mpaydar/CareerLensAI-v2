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

function pickNewerHighlight(
  a: HighlightState,
  b: HighlightState,
): HighlightState {
  const aTime = Date.parse(a.updatedAt) || 0;
  const bTime = Date.parse(b.updatedAt) || 0;
  if (aTime === bTime) {
    return a.text.length >= b.text.length ? a : b;
  }
  return aTime >= bTime ? a : b;
}

/**
 * Chrome extension writes global scope only. Logged-in users may also have
 * per-user highlights from in-app selection — return the newest non-empty state.
 */
export async function getHighlightForSession(): Promise<HighlightState> {
  const globalState = await getHighlightState(GLOBAL_HIGHLIGHT_SCOPE);
  const userId = await getSessionUserId();
  if (!userId) {
    return globalState;
  }

  const userState = await getHighlightState(userId);
  const globalText = globalState.text.trim();
  const userText = userState.text.trim();

  if (!globalText) {
    return userState;
  }
  if (!userText) {
    return globalState;
  }

  return pickNewerHighlight(globalState, userState);
}
