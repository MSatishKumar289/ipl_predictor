import { Redirect, Stack, router, usePathname } from "expo-router";
import { Linking } from "react-native";

import { RouteFallbackScreen } from "@/components/RouteFallbackScreen";
import { QuickRulesWidget } from "@/components/QuickRulesWidget";
import { logout } from "@/lib/auth";
import { AuthProvider } from "@/providers/AuthProvider";
import { useAuth } from "@/providers/AuthProvider";

const authRoute = "/";
const authenticatedRoute = "/(tabs)/home";
const publicRoutes = new Set([authRoute, "/logout", "/+not-found"]);
const accessPhoneNumber = "918973016124";

export default function RootLayout() {
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
  const isPendingApproval = !!user && profile?.accessStatus === "pending_approval";

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

  if (!isLoading && isPendingApproval && pathname !== "/logout") {
    return (
      <RouteFallbackScreen
        eyebrow="Access Required"
        title="Approval Pending"
        description="Your account is waiting for admin approval. Request access on WhatsApp to continue."
        primaryActionLabel="Request On WhatsApp"
        secondaryActionLabel="Back To Login"
        onPrimaryAction={() => {
          const name = profile?.displayName?.trim() || "Unknown";
          const message = `Hi, I need access to FPL. My name is ${name}.`;
          const url = `https://wa.me/${accessPhoneNumber}?text=${encodeURIComponent(message)}`;
          void Linking.openURL(url);
        }}
        onSecondaryAction={() => {
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
          contentStyle: { backgroundColor: "#0A1325" },
        }}
      />
      <QuickRulesWidget enabled={shouldShowQuickRules} autoOpen={shouldShowQuickRules} />
      <QuickRulesWidget enabled={shouldShowAdminFab} autoOpen={false} variant="admin" />
    </>
  );
}
