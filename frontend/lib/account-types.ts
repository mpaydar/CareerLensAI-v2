export type AccountUser = {
  id: string;
  firstName: string;
  lastName: string;
  plan: "free" | "pro";
  onboardingComplete: boolean;
  createdAt: string;
};

export type ResumeMeta = {
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  storedFileName: string;
};

export type UsageStats = {
  limit: number;
  remaining: number;
  reset: number;
  used: number;
};

export type AccountState = {
  user: AccountUser | null;
  resume: ResumeMeta | null;
  usage: UsageStats;
  upgradeUrl: string;
  loading: boolean;
};
