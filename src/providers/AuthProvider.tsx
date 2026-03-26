import { Alert } from "react-native";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";

import { ensureUserProfile, subscribeToAuth, subscribeToUserProfile } from "@/lib/auth";
import type { UserProfile } from "@/lib/auth-types";
import { firebaseInitializationError } from "@/lib/firebase";
import { markReferralMessageSeen } from "@/lib/referrals";
import {
  addPushNotificationResponseListener,
  handleInitialPushNotificationResponse,
  registerCurrentDeviceForPushNotifications,
  unregisterCurrentDevicePushToken,
} from "@/lib/push-notifications";

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
  const currentPushTokenRef = useRef<string | null>(null);
  const previousUserIdRef = useRef<string | null>(null);
  const handledNotificationIdsRef = useRef(new Set<string>());

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

  useEffect(() => {
    const hasHandledResponse = (identifier: string) =>
      handledNotificationIdsRef.current.has(identifier);
    const markResponseHandled = (identifier: string) => {
      handledNotificationIdsRef.current.add(identifier);
    };

    void handleInitialPushNotificationResponse(hasHandledResponse, markResponseHandled);

    return addPushNotificationResponseListener(hasHandledResponse, markResponseHandled);
  }, []);

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    const currentUserId = user?.uid ?? null;

    if (
      previousUserId &&
      previousUserId !== currentUserId &&
      currentPushTokenRef.current
    ) {
      void unregisterCurrentDevicePushToken(previousUserId, currentPushTokenRef.current);
      currentPushTokenRef.current = null;
    }

    previousUserIdRef.current = currentUserId;
  }, [user?.uid]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let isActive = true;

    void (async () => {
      try {
        const token = await registerCurrentDeviceForPushNotifications(user.uid);

        if (isActive) {
          currentPushTokenRef.current = token;
        }
      } catch (pushError) {
        console.error(
          "Push notification registration failed:",
          pushError instanceof Error ? pushError.message : pushError
        );
      }
    })();

    return () => {
      isActive = false;
    };
  }, [user?.uid]);

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
