import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect, type Href } from "expo-router";

import { signInWithEmail, signUpWithEmail } from "@/lib/auth";
import { useAuth } from "@/providers/AuthProvider";

type AuthMode = "login" | "signup";

const signupBonus = 50000;
const authenticatedRoute = "/(tabs)/home" as Href;

export default function HomeScreen() {
  const { isLoading, user } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signup");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing details", "Email and password are required.");
      return;
    }

    if (mode === "signup" && !displayName.trim()) {
      Alert.alert("Missing details", "Display name is required for sign up.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "signup") {
        await signUpWithEmail({
          displayName: displayName.trim(),
          email: email.trim(),
          password,
          phoneNumber: phoneNumber.trim() || undefined,
        });
      } else {
        await signInWithEmail({
          email: email.trim(),
          password,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to complete authentication.";
      Alert.alert("Authentication failed", message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#1E5AE0" />
          <Text style={styles.loadingText}>Connecting IPL Predictor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (user) {
    return <Redirect href={authenticatedRoute} />;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Image
              source={require("../../assets/images/Background.png")}
              style={styles.logoImage}
              resizeMode="cover"
            />
          </View>
          <Text style={styles.title}>IPL Predictor</Text>
          <Text style={styles.subtitle}>
            Private leaderboard, match winner picks, and automatic scorekeeping.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeChip, mode === "signup" && styles.modeChipActive]}
              onPress={() => setMode("signup")}
            >
              <Text
                style={[
                  styles.modeChipText,
                  mode === "signup" && styles.modeChipTextActive,
                ]}
              >
                Sign Up
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeChip, mode === "login" && styles.modeChipActive]}
              onPress={() => setMode("login")}
            >
              <Text
                style={[
                  styles.modeChipText,
                  mode === "login" && styles.modeChipTextActive,
                ]}
              >
                Login
              </Text>
            </Pressable>
          </View>

          <Text style={styles.label}>
            {mode === "signup" ? "CREATE ACCOUNT" : "WELCOME BACK"}
          </Text>

          {mode === "signup" ? (
            <>
              <TextInput
                placeholder="Display name"
                placeholderTextColor="#4C5D7C"
                style={styles.input}
                autoCapitalize="words"
                value={displayName}
                onChangeText={setDisplayName}
              />
              <TextInput
                placeholder="Phone number (optional)"
                placeholderTextColor="#4C5D7C"
                style={styles.input}
                keyboardType="phone-pad"
                value={phoneNumber}
                onChangeText={(value) => setPhoneNumber(value.replace(/[^0-9]/g, ""))}
              />
            </>
          ) : null}

          <TextInput
            placeholder="Email address"
            placeholderTextColor="#4C5D7C"
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          <TextInput
            placeholder="Password"
            placeholderTextColor="#4C5D7C"
            style={styles.input}
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
          />

          <Text style={styles.helperText}>
            {mode === "signup"
              ? `New users receive Rs. ${signupBonus.toLocaleString("en-IN")} instantly.`
              : "Use the email and password you registered with."}
          </Text>

          <Pressable
            style={[styles.button, isSubmitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Text style={styles.buttonText}>
              {isSubmitting
                ? "Please wait..."
                : mode === "signup"
                  ? "Create Account"
                  : "Login"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#07152E",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 72,
    paddingBottom: 40,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    paddingHorizontal: 28,
    backgroundColor: "#07152E",
  },
  loadingText: {
    color: "#DDE5F7",
    fontSize: 18,
    fontWeight: "600",
  },
  header: {
    alignItems: "center",
    marginBottom: 30,
  },
  logoBox: {
    width: 116,
    height: 116,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 28,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  title: {
    color: "#F5F7FB",
    fontSize: 46,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 14,
    textShadowColor: "rgba(0, 0, 0, 0.45)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 8,
  },
  subtitle: {
    color: "#93A1BC",
    fontSize: 18,
    textAlign: "center",
    lineHeight: 28,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(109, 138, 196, 0.25)",
    backgroundColor: "rgba(7, 21, 46, 0.72)",
    paddingHorizontal: 26,
    paddingVertical: 30,
  },
  modeRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  modeChip: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334C76",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#101D38",
  },
  modeChipActive: {
    backgroundColor: "#1E5AE0",
    borderColor: "#1E5AE0",
  },
  modeChipText: {
    color: "#A7B4D0",
    fontSize: 16,
    fontWeight: "700",
  },
  modeChipTextActive: {
    color: "#F7FAFF",
  },
  label: {
    color: "#DDE5F7",
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.6,
    marginBottom: 16,
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#334C76",
    backgroundColor: "#162645",
    paddingHorizontal: 18,
    height: 64,
    marginBottom: 16,
    color: "#F7FAFF",
    fontSize: 18,
    fontWeight: "500",
  },
  helperText: {
    color: "#94A4C0",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 28,
  },
  button: {
    height: 64,
    borderRadius: 18,
    backgroundColor: "#1E5AE0",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0B1325",
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#F7FAFF",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});
