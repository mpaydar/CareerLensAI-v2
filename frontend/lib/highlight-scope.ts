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

function highlightTimestamp(state: HighlightState): number {
  const parsed = Date.parse(state.updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Prefer the newest highlight; extension writes global, dashboard may write user scope. */
export async function getHighlightForSession(): Promise<HighlightState> {
  const userId = await getSessionUserId();
  const globalState = await getHighlightState(GLOBAL_HIGHLIGHT_SCOPE);

  if (!userId) {
    return globalState;
  }

  const userState = await getHighlightState(userId);
  const userHasText = Boolean(userState.text.trim());
  const globalHasText = Boolean(globalState.text.trim());

  if (!userHasText) {
    return globalState;
  }
  if (!globalHasText) {
    return userState;
  }

  return highlightTimestamp(globalState) >= highlightTimestamp(userState)
    ? globalState
    : userState;
}
