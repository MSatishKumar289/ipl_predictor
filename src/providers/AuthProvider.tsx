import { Alert } from "react-native";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
const retryableProfileErrorCodes = new Set([
  "aborted",
  "cancelled",
  "deadline-exceeded",
  "internal",
  "resource-exhausted",
  "unavailable",
  "unknown",
]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initializedUserIdRef = useRef<string | null>(null);
  const initializingUserIdRef = useRef<string | null>(null);

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
    let profileRetryTimeout: ReturnType<typeof setTimeout> | null = null;
    let profileRetryAttempt = 0;
    let ensuringMissingProfileForUid: string | null = null;

    try {
      unsubscribeAuth = subscribeToAuth(async (nextUser) => {
        if (!nextUser) {
          unsubscribeProfile?.();
          unsubscribeProfile = null;
          if (profileRetryTimeout) {
            clearTimeout(profileRetryTimeout);
            profileRetryTimeout = null;
          }
          profileRetryAttempt = 0;
          ensuringMissingProfileForUid = null;
          setIsLoading(true);
          setUser(nextUser);
          initializedUserIdRef.current = null;
          initializingUserIdRef.current = null;
          setProfile(null);
          setError(null);
          setIsLoading(false);
          return;
        }

        if (
          initializedUserIdRef.current === nextUser.uid ||
          initializingUserIdRef.current === nextUser.uid
        ) {
          return;
        }

        unsubscribeProfile?.();
        unsubscribeProfile = null;
        if (profileRetryTimeout) {
          clearTimeout(profileRetryTimeout);
          profileRetryTimeout = null;
        }
        profileRetryAttempt = 0;
        setIsLoading(true);
        setUser(nextUser);

        setError(null);
        initializingUserIdRef.current = nextUser.uid;
        const subscribeToProfile = () => {
          unsubscribeProfile?.();

          unsubscribeProfile = subscribeToUserProfile(
            nextUser.uid,
            (nextProfile) => {
              if (profileRetryTimeout) {
                clearTimeout(profileRetryTimeout);
                profileRetryTimeout = null;
              }

              profileRetryAttempt = 0;

              if (!nextProfile) {
                initializedUserIdRef.current = null;

                if (ensuringMissingProfileForUid === nextUser.uid) {
                  return;
                }

                ensuringMissingProfileForUid = nextUser.uid;

                void ensureUserProfile(nextUser, {
                  grantSignupBonusIfNew: true,
                  profileKnownMissing: true,
                })
                  .then(() => {})
                  .catch((authError) => {
                    const message =
                      authError instanceof Error
                        ? authError.message
                        : "Unable to load user profile.";

                    initializingUserIdRef.current = null;
                    initializedUserIdRef.current = null;
                    setProfile(null);
                    setError(`Profile read failed: ${message}`);
                    setIsLoading(false);
                  })
                  .finally(() => {
                    ensuringMissingProfileForUid = null;
                  });

                return;
              }

              initializingUserIdRef.current = null;
              initializedUserIdRef.current = nextUser.uid;
              ensuringMissingProfileForUid = null;

              setProfile(nextProfile);
              setError(null);
              setIsLoading(false);
            },
            (profileError) => {
              const code =
                typeof profileError === "object" &&
                profileError &&
                "code" in profileError
                  ? String(profileError.code)
                  : "";

              if (retryableProfileErrorCodes.has(code)) {
                profileRetryAttempt += 1;
                const retryDelayMs = Math.min(1000 * 2 ** (profileRetryAttempt - 1), 10000);

                unsubscribeProfile?.();
                unsubscribeProfile = null;
                initializedUserIdRef.current = null;
                setProfile(null);
                setError(null);
                setIsLoading(true);

                if (profileRetryTimeout) {
                  clearTimeout(profileRetryTimeout);
                }

                profileRetryTimeout = setTimeout(() => {
                  subscribeToProfile();
                }, retryDelayMs);

                return;
              }

              const message =
                profileError instanceof Error
                  ? profileError.message
                  : "Unable to subscribe to user profile.";

              initializingUserIdRef.current = null;
              initializedUserIdRef.current = null;
              setProfile(null);
              setError(`Profile read failed: ${message}`);
              setIsLoading(false);
            }
          );
        };

        subscribeToProfile();
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to initialize authentication.";

      setProfile(null);
      setError(message);
      setIsLoading(false);
    }

    return () => {
      if (profileRetryTimeout) {
        clearTimeout(profileRetryTimeout);
      }
      ensuringMissingProfileForUid = null;
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
