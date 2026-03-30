import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppScreenBackground } from "@/components/AppScreenBackground";
import { StickyHeaderBar } from "@/components/StickyHeaderBar";
import { logout } from "@/lib/auth";
import { useAuth } from "@/providers/AuthProvider";

const redirectDelayMs = 5000;

type LogoutStatus = "preparing" | "success" | "error";

export default function LogoutScreen() {
  const { isLoading, user } = useAuth();
  const [status, setStatus] = useState<LogoutStatus>("preparing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(5);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (isLoading || hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;

    if (!user) {
      setStatus("success");
      return;
    }

    void (async () => {
      try {
        await logout();
        setStatus("success");
      } catch (error) {
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Unable to sign out.");
      }
    })();
  }, [isLoading, user]);

  useEffect(() => {
    if (status !== "success") {
      return;
    }

    setSecondsRemaining(5);

    const intervalId = setInterval(() => {
      setSecondsRemaining((current) => (current > 1 ? current - 1 : current));
    }, 1000);

    const timeoutId = setTimeout(() => {
      router.replace("/");
    }, redirectDelayMs);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [status]);

  return (
    <SafeAreaView style={styles.screen}>
      <AppScreenBackground />
      <View style={styles.pageShell}>
        <StickyHeaderBar
          title="Logout"
          centered
        />

        <View style={styles.card}>
        {status === "preparing" ? (
          <>
            <ActivityIndicator size="large" color="#1E5AE0" />
            <Text style={styles.title}>Signing out...</Text>
            <Text style={styles.subtitle}>Please wait while we close your session.</Text>
          </>
        ) : null}

        {status === "success" ? (
          <>
            <Text style={styles.title}>Successfully logged out</Text>
            <Text style={styles.subtitle}>
              Redirecting to the login screen in {secondsRemaining} seconds.
            </Text>
            <Pressable style={styles.button} onPress={() => router.replace("/")}>
              <Text style={styles.buttonText}>Go to Login</Text>
            </Pressable>
          </>
        ) : null}

        {status === "error" ? (
          <>
            <Text style={styles.title}>Sign out failed</Text>
            <Text style={styles.subtitle}>
              {errorMessage || "Something went wrong while signing out."}
            </Text>
            <Pressable style={styles.button} onPress={() => router.replace("/(tabs)/profile")}>
              <Text style={styles.buttonText}>Back to Profile</Text>
            </Pressable>
          </>
        ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0A1325",
    padding: 24,
  },
  pageShell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 28,
    alignItems: "center",
    gap: 16,
  },
  title: {
    color: "#F7FAFF",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    color: "#9FB0CF",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  button: {
    marginTop: 8,
    minWidth: 180,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#1E5AE0",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  buttonText: {
    color: "#F7FAFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
