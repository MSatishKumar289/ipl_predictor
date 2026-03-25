import { Alert } from "react-native";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";

import { ensureUserProfile, subscribeToAuth, subscribeToUserProfile } from "@/lib/auth";
import type { UserProfile } from "@/lib/auth-types";
import { firebaseInitializationError } from "@/lib/firebase";
import { markReferralMessageSeen } from "@/lib/referrals";

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
    if (firebaseInitializationError) {
      setUser(null);
      setProfile(null);
      setError(firebaseInitializationError);
      setIsLoading(false);
      return;
    }

    let unsubscribeProfile: (() => void) | null = null;

    let unsubscribeAuth: (() => void) | null = null;

    try {
      unsubscribeAuth = subscribeToAuth(async (nextUser) => {
        unsubscribeProfile?.();
        unsubscribeProfile = null;
        setUser(nextUser);

        if (!nextUser) {
          setProfile(null);
          setError(null);
          setIsLoading(false);
          return;
        }

        setError(null);

        try {
          await ensureUserProfile(nextUser, {
            grantSignupBonusIfNew: true,
          });

          unsubscribeProfile = subscribeToUserProfile(
            nextUser.uid,
            (nextProfile) => {
              setProfile(nextProfile);
              setError(null);
              setIsLoading(false);
            },
            (profileError) => {
              const message =
                profileError instanceof Error
                  ? profileError.message
                  : "Unable to subscribe to user profile.";

              setProfile(null);
              setError(`Profile read failed: ${message}`);
              setIsLoading(false);
            }
          );
        } catch (authError) {
          const message =
            authError instanceof Error ? authError.message : "Unable to load user profile.";

          setProfile(null);
          setError(`Profile read failed: ${message}`);
        } finally {
          setIsLoading(false);
        }
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to initialize authentication.";

      setProfile(null);
      setError(message);
      setIsLoading(false);
    }

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth?.();
    };
  }, []);

  useEffect(() => {
    if (!user || !profile?.referredByDisplayName || profile.hasSeenReferralMessage) {
      return;
    }

    Alert.alert(
      "Referral Applied",
      `You were referred by ${profile.referredByDisplayName}.`
    );

    void markReferralMessageSeen(user.uid);
  }, [profile, user]);

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
