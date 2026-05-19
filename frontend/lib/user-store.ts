import { getRedis } from "@/lib/redis";

export type UserPlan = "free" | "pro";

export type User = {
  id: string;
  firstName: string;
  lastName: string;
  plan: UserPlan;
  onboardingComplete: boolean;
  createdAt: string;
};

const USER_KEY_PREFIX = "resumesnap:user:";

function userKey(id: string): string {
  return `${USER_KEY_PREFIX}${id}`;
}

const usersMemory = new Map<string, User>();

export async function getUserById(id: string): Promise<User | null> {
  const redis = getRedis();
  if (redis) {
    const stored = await redis.get<User>(userKey(id));
    return stored ?? null;
  }
  return usersMemory.get(id) ?? null;
}

export async function saveUser(user: User): Promise<User> {
  const redis = getRedis();
  if (redis) {
    await redis.set(userKey(user.id), user);
    return user;
  }
  usersMemory.set(user.id, user);
  return user;
}

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
