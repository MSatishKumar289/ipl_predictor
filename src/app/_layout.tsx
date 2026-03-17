import { useEffect } from "react";
import { Stack, useRootNavigationState, useRouter, useSegments } from "expo-router";

import { AuthProvider } from "@/providers/AuthProvider";
import { useAuth } from "@/providers/AuthProvider";

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

function AuthGate() {
  const { isLoading, user } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (isLoading || !navigationState?.key) {
      return;
    }

    const [rootSegment] = segments;
    const isProtectedRoute =
      rootSegment === "(tabs)" || rootSegment === "admin" || rootSegment === "match";
    const isRootAuthScreen = rootSegment == null;

    if (!user && isProtectedRoute) {
      router.replace("/");
      return;
    }

    if (user && isRootAuthScreen) {
      router.replace("/(tabs)/home");
    }
  }, [isLoading, navigationState?.key, router, segments, user]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
