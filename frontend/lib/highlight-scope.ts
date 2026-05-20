import {
  GLOBAL_HIGHLIGHT_SCOPE,
  getHighlightState,
  replaceHighlightState,
  type HighlightState,
} from "@/lib/highlight-store";
import { getSessionUserId } from "@/lib/session";

export async function getHighlightScopeId(): Promise<string> {
  const userId = await getSessionUserId();
  return userId ?? GLOBAL_HIGHLIGHT_SCOPE;
}

/** Copy extension global highlight into the logged-in user's scope for gap/JD UI. */
export async function syncGlobalHighlightForUser(userId: string): Promise<void> {
  const globalState = await getHighlightState(GLOBAL_HIGHLIGHT_SCOPE);
  if (!globalState.text.trim()) {
    return;
  }

  const userState = await getHighlightState(userId);
  const globalTime = Date.parse(globalState.updatedAt) || 0;
  const userTime = Date.parse(userState.updatedAt) || 0;

  if (!userState.text.trim() || globalTime >= userTime) {
    await replaceHighlightState(userId, { ...globalState });
  }
}

/**
 * Chrome extension writes global scope only. Prefer global whenever it has text
 * so LinkedIn captures always appear in the live view.
 */
export async function getHighlightForSession(): Promise<HighlightState> {
  const globalState = await getHighlightState(GLOBAL_HIGHLIGHT_SCOPE);
  const userId = await getSessionUserId();

  if (userId) {
    await syncGlobalHighlightForUser(userId);
  }

  if (!userId) {
    return globalState;
  }

  if (globalState.text.trim()) {
    return globalState;
  }

  return getHighlightState(userId);
}
