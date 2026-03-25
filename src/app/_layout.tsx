import { Redirect, Stack, usePathname } from "expo-router";

import { RouteFallbackScreen } from "@/components/RouteFallbackScreen";
import { QuickRulesWidget } from "@/components/QuickRulesWidget";
import { AuthProvider } from "@/providers/AuthProvider";
import { useAuth } from "@/providers/AuthProvider";

const authRoute = "/";
const authenticatedRoute = "/(tabs)/home";
const publicRoutes = new Set([authRoute, "/logout", "/+not-found"]);

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

function AuthGate() {
  const { isLoading, user } = useAuth();
  const pathname = usePathname();
  const isRootAuthScreen = pathname === authRoute;
  const isPublicRoute = publicRoutes.has(pathname);
  const shouldShowQuickRules = !isLoading && !!user && !isPublicRoute;

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

  if (!isLoading && user && isRootAuthScreen) {
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
    </>
  );
}
