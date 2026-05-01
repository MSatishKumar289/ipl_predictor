import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { Redirect, Stack, router, usePathname } from "expo-router";

import { RouteFallbackScreen } from "@/components/RouteFallbackScreen";
import { QuickRulesWidget } from "@/components/QuickRulesWidget";
import { BonusNoticePopup } from "@/components/BonusNoticePopup";
import {
  checkWebAppVersion,
  dismissSoftVersionNotice,
  type AppVersionCheckResult,
} from "@/lib/app-version";
import { logout } from "@/lib/auth";
import { AppDataProvider } from "@/providers/AppDataProvider";
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
      <AppDataProvider>
        <AuthGate />
      </AppDataProvider>
    </AuthProvider>
  );
}

function AuthGate() {
  const { isLoading, user, profile, error } = useAuth();
  const [versionCheck, setVersionCheck] = useState<AppVersionCheckResult | null>(null);
  const pathname = usePathname();
  const isRootAuthScreen = pathname === authRoute;
  const isPublicRoute = publicRoutes.has(pathname);
  const isAdminRoute = pathname === "/admin";
  const shouldShowQuickRules = !isLoading && !!user && !isPublicRoute && profile?.role !== "admin";
  const shouldShowAdminFab =
    !isLoading && !!user && !isPublicRoute && !isAdminRoute && profile?.role === "admin";

  useEffect(() => {
    let isActive = true;

    void checkWebAppVersion()
      .then((result) => {
        if (!isActive) {
          return;
        }
        setVersionCheck(result);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        setVersionCheck(null);
      });

    return () => {
      isActive = false;
    };
  }, []);

  async function handleLaterVersionNotice() {
    if (!versionCheck || versionCheck.status !== "soft") {
      return;
    }

    await dismissSoftVersionNotice(versionCheck.remote.latestVersion);
    setVersionCheck({
      ...versionCheck,
      status: "none",
    });
  }

  function handleRefreshPage() {
    if (typeof window !== "undefined" && typeof window.location?.reload === "function") {
      window.location.reload();
    }
  }

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
      {versionCheck?.status !== "none" ? (
        <Modal visible transparent animationType="fade">
          <View style={styles.versionModalOverlay}>
            <View style={styles.versionModalCard}>
              <Text style={styles.versionModalTitle}>
                {versionCheck?.status === "force" ? "Update Required" : "Update Available"}
              </Text>
              <Text style={styles.versionModalText}>
                {versionCheck?.remote.message || "A new app version is available. Please refresh."}
              </Text>
              <Text style={styles.versionModalMeta}>
                Current: {versionCheck?.currentVersion} | Latest: {versionCheck?.remote.latestVersion}
              </Text>
              <Pressable style={styles.versionPrimaryButton} onPress={handleRefreshPage}>
                <Text style={styles.versionPrimaryButtonText}>Refresh</Text>
              </Pressable>
              {versionCheck?.status === "soft" ? (
                <Pressable style={styles.versionSecondaryButton} onPress={() => void handleLaterVersionNotice()}>
                  <Text style={styles.versionSecondaryButtonText}>Later</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </Modal>
      ) : null}
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
  versionModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(6, 14, 29, 0.72)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 20,
  },
  versionModalCard: {
    width: "100%" as const,
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#355586",
    backgroundColor: "#173055",
    padding: 20,
    gap: 10,
  },
  versionModalTitle: {
    color: "#F7FAFF",
    fontSize: 22,
    fontWeight: "800" as const,
  },
  versionModalText: {
    color: "#D6E3FA",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600" as const,
  },
  versionModalMeta: {
    color: "#8EA0C1",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
  versionPrimaryButton: {
    height: 46,
    borderRadius: 14,
    backgroundColor: "#1E5AE0",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  versionPrimaryButtonText: {
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "800" as const,
  },
  versionSecondaryButton: {
    height: 42,
    borderRadius: 14,
    backgroundColor: "#1B2740",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  versionSecondaryButtonText: {
    color: "#D7E1F5",
    fontSize: 14,
    fontWeight: "700" as const,
  },
};
