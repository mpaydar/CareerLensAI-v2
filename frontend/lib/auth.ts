import { getSessionUserId } from "@/lib/session";
import { getUserById, type User } from "@/lib/user-store";

export async function getAuthenticatedUser(): Promise<User | null> {
  const userId = await getSessionUserId();
  if (!userId) {
    return null;
  }
  return getUserById(userId);
}

export async function requireAuthenticatedUser(): Promise<User> {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  if (!user.onboardingComplete) {
    throw new Error("ONBOARDING_REQUIRED");
  }
  return user;
}
