import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect, Stack, router, usePathname } from "expo-router";

import { RouteFallbackScreen } from "@/components/RouteFallbackScreen";
import { QuickRulesWidget } from "@/components/QuickRulesWidget";
import { BonusNoticePopup } from "@/components/BonusNoticePopup";
import { logout } from "@/lib/auth";
import { AuthProvider } from "@/providers/AuthProvider";
import { useAuth } from "@/providers/AuthProvider";

const authRoute = "/";
const authenticatedRoute = "/(tabs)/home";
const publicRoutes = new Set([authRoute, "/logout", "/+not-found"]);

export default function RootLayout() {
  const [isClientReady, setIsClientReady] = useState(false);

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  if (!isClientReady) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#1E5AE0" />
        <Text style={styles.loadingText}>Loading FPL...</Text>
      </View>
    );
  }

  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

function AuthGate() {
  const { isLoading, user, profile, error } = useAuth();
  const pathname = usePathname();
  const isRootAuthScreen = pathname === authRoute;
  const isPublicRoute = publicRoutes.has(pathname);
  const isAdminRoute = pathname === "/admin";
  const shouldShowQuickRules = !isLoading && !!user && !isPublicRoute && profile?.role !== "admin";
  const shouldShowAdminFab =
    !isLoading && !!user && !isPublicRoute && !isAdminRoute && profile?.role === "admin";

  if (!isLoading && !user && !isPublicRoute) {
    return (
      <RouteFallbackScreen
        eyebrow="Access Required"
        title="Login Required"
        description="This page is available only after login. Use login or register to continue into the app."
        showAuthActions
      />
    );
  }

  if (!isLoading && !!user && !profile && !!error && pathname !== "/logout") {
    return (
      <RouteFallbackScreen
        eyebrow="Profile Required"
        title="Profile Unavailable"
        description="Your account profile could not be loaded yet. Log out and try again after refreshing the app."
        primaryActionLabel="Back To Login"
        onPrimaryAction={() => {
          void logout().finally(() => {
            router.replace("/");
          });
        }}
      />
    );
  }

  if (!isLoading && user && profile && isRootAuthScreen) {
    return <Redirect href={authenticatedRoute} />;
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#102043" },
        }}
      />
      <QuickRulesWidget
        enabled={shouldShowQuickRules}
        autoOpen={shouldShowQuickRules}
        userId={user?.uid}
      />
      <QuickRulesWidget enabled={shouldShowAdminFab} autoOpen={false} variant="admin" />
      <BonusNoticePopup userId={user?.uid} />
    </>
  );
}

const styles = {
  loadingScreen: {
    flex: 1,
    backgroundColor: "#102043",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 16,
    paddingHorizontal: 24,
  },
  loadingText: {
    color: "#DDE5F7",
    fontSize: 16,
    fontWeight: "600" as const,
  },
};
