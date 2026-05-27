import { getRedis } from "@/lib/redis";
import type { OAuthProvider } from "@/lib/oauth";

export type UserPlan = "free" | "pro";
export type CareerFocus = "industrial" | "academic";

export type User = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  plan: UserPlan;
  onboardingComplete: boolean;
  createdAt: string;
  authProvider?: OAuthProvider;
  authProviderId?: string;
  lastLoginIp?: string;
  lastLoginAt?: string;
  careerFocus?: CareerFocus;
};

const USER_KEY_PREFIX = "resumesnap:user:";
const OAUTH_KEY_PREFIX = "resumesnap:oauth:";

function userKey(id: string): string {
  return `${USER_KEY_PREFIX}${id}`;
}

function oauthKey(provider: OAuthProvider, providerId: string): string {
  return `${OAUTH_KEY_PREFIX}${provider}:${providerId}`;
}

const usersMemory = new Map<string, User>();
const oauthMemory = new Map<string, string>();

export async function getUserById(id: string): Promise<User | null> {
  const redis = getRedis();
  if (redis) {
    const stored = await redis.get<User>(userKey(id));
    return stored ?? null;
  }
  return usersMemory.get(id) ?? null;
}

export async function findUserByOAuth(
  provider: OAuthProvider,
  providerId: string,
): Promise<User | null> {
  const redis = getRedis();
  const key = oauthKey(provider, providerId);
  if (redis) {
    const userId = await redis.get<string>(key);
    if (!userId || typeof userId !== "string") {
      return null;
    }
    return getUserById(userId);
  }
  const userId = oauthMemory.get(key);
  return userId ? getUserById(userId) : null;
}

export async function saveUser(user: User): Promise<User> {
  const redis = getRedis();
  if (redis) {
    await redis.set(userKey(user.id), user);
    if (user.authProvider && user.authProviderId) {
      await redis.set(oauthKey(user.authProvider, user.authProviderId), user.id);
    }
    return user;
  }
  usersMemory.set(user.id, user);
  if (user.authProvider && user.authProviderId) {
    oauthMemory.set(oauthKey(user.authProvider, user.authProviderId), user.id);
  }
  return user;
}

export async function createOAuthUser(input: {
  provider: OAuthProvider;
  providerId: string;
  firstName: string;
  lastName: string;
  email?: string;
  lastLoginIp: string;
}): Promise<User> {
  const user: User = {
    id: crypto.randomUUID(),
    firstName: input.firstName.trim() || "User",
    lastName: input.lastName.trim(),
    email: input.email,
    plan: "free",
    onboardingComplete: false,
    createdAt: new Date().toISOString(),
    authProvider: input.provider,
    authProviderId: input.providerId,
    lastLoginIp: input.lastLoginIp,
    lastLoginAt: new Date().toISOString(),
  };
  return saveUser(user);
}

export async function recordUserLogin(
  userId: string,
  ip: string,
): Promise<User | null> {
  const user = await getUserById(userId);
  if (!user) {
    return null;
  }
  return saveUser({
    ...user,
    lastLoginIp: ip,
    lastLoginAt: new Date().toISOString(),
  });
}

/** @deprecated Use OAuth sign-in; kept for tests/local fallback */
export async function createUser(input: {
  firstName: string;
  lastName: string;
}): Promise<User> {
  const user: User = {
    id: crypto.randomUUID(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    plan: "free",
    onboardingComplete: false,
    createdAt: new Date().toISOString(),
  };
  return saveUser(user);
}

export async function completeOnboarding(userId: string): Promise<User | null> {
  const user = await getUserById(userId);
  if (!user) {
    return null;
  }
  return saveUser({ ...user, onboardingComplete: true });
}

export async function updateUserProfile(
  userId: string,
  input: { firstName?: string; lastName?: string; careerFocus?: CareerFocus },
): Promise<User | null> {
  const user = await getUserById(userId);
  if (!user) {
    return null;
  }
  return saveUser({
    ...user,
    firstName: input.firstName?.trim() ?? user.firstName,
    lastName: input.lastName?.trim() ?? user.lastName,
    careerFocus: input.careerFocus ?? user.careerFocus,
  });
}
