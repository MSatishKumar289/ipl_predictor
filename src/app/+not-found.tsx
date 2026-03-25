import { RouteFallbackScreen } from "@/components/RouteFallbackScreen";
import { useAuth } from "@/providers/AuthProvider";

export default function NotFoundScreen() {
  const { user } = useAuth();

  return (
    <RouteFallbackScreen
      eyebrow="Invalid URL"
      title="Page Not Found"
      description={
        user
          ? "The page you tried to open does not exist. Use the button below to return to the app."
          : "The page you tried to open does not exist. Use login or register to continue into the app."
      }
      showAuthActions={!user}
    />
  );
}
