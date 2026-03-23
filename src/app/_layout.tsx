import { Redirect, Stack, usePathname } from "expo-router";

import { AuthProvider } from "@/providers/AuthProvider";
import { useAuth } from "@/providers/AuthProvider";

const authRoute = "/";
const authenticatedRoute = "/(tabs)/home";
const publicRoutes = new Set([authRoute, "/logout"]);

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

  if (!isLoading && !user && !isPublicRoute) {
    return <Redirect href={authRoute} />;
  }

  if (!isLoading && user && isRootAuthScreen) {
    return <Redirect href={authenticatedRoute} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0A1325" },
      }}
    />
  );
}
