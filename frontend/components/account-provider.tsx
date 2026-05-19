"use client";

import type { AccountState, AccountUser, UsageStats } from "@/lib/account-types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { UpgradeModal } from "@/components/upgrade-modal";

const DEFAULT_USAGE: UsageStats = {
  limit: 3,
  remaining: 3,
  reset: Date.now(),
  used: 0,
};

type AccountContextValue = AccountState & {
  refreshAccount: () => Promise<void>;
  showUpgrade: () => void;
  handleRateLimitResponse: (response: Response, data?: { error?: string }) => boolean;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [resume, setResume] = useState<AccountState["resume"]>(null);
  const [usage, setUsage] = useState<UsageStats>(DEFAULT_USAGE);
  const [upgradeUrl, setUpgradeUrl] = useState("#");
  const [loading, setLoading] = useState(true);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState<string | undefined>();

  const refreshAccount = useCallback(async () => {
    try {
      const response = await fetch("/api/account", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as {
        user: AccountUser | null;
        resume: AccountState["resume"];
        usage: UsageStats;
        upgradeUrl?: string;
      };
      setUser(data.user);
      setResume(data.resume);
      setUsage(data.usage ?? DEFAULT_USAGE);
      if (data.upgradeUrl) {
        setUpgradeUrl(data.upgradeUrl);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  const showUpgrade = useCallback((message?: string) => {
    setUpgradeMessage(message);
    setUpgradeOpen(true);
  }, []);

  const handleRateLimitResponse = useCallback(
    (response: Response, data?: { error?: string; code?: string }) => {
      if (response.status !== 429) {
        return false;
      }
      void refreshAccount();
      showUpgrade(
        data?.error ??
          "You've used your free AI credits for this month. Upgrade to keep going.",
      );
      return true;
    },
    [refreshAccount, showUpgrade],
  );

  const value = useMemo<AccountContextValue>(
    () => ({
      user,
      resume,
      usage,
      upgradeUrl,
      loading,
      refreshAccount,
      showUpgrade,
      handleRateLimitResponse,
    }),
    [
      user,
      resume,
      usage,
      upgradeUrl,
      loading,
      refreshAccount,
      showUpgrade,
      handleRateLimitResponse,
    ],
  );

  return (
    <AccountContext.Provider value={value}>
      {children}
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        usage={usage}
        upgradeUrl={upgradeUrl}
        message={upgradeMessage}
      />
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    throw new Error("useAccount must be used within AccountProvider");
  }
  return ctx;
}
