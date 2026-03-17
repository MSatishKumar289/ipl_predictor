import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";

import { ensureUserProfile, subscribeToAuth } from "@/lib/auth";
import type { UserProfile } from "@/lib/auth-types";

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  error: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuth(async (nextUser) => {
      setUser(nextUser);

      if (!nextUser) {
        setProfile(null);
        setError(null);
        setIsLoading(false);
        return;
      }

      setError(null);

      try {
        const nextProfile = await ensureUserProfile(nextUser, {
          grantSignupBonusIfNew: true,
        });
        setProfile(nextProfile as UserProfile | null);
      } catch (authError) {
        const message =
          authError instanceof Error ? authError.message : "Unable to load user profile.";

        setProfile(null);
        setError(`Profile read failed: ${message}`);
      } finally {
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const value = useMemo(
    () => ({
      user,
      profile,
      isLoading,
      error,
    }),
    [error, isLoading, profile, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
