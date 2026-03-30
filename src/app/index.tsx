import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppScreenBackground } from "@/components/AppScreenBackground";
import { StickyHeaderBar } from "@/components/StickyHeaderBar";
import { signInWithPhone, signUpWithPhone } from "@/lib/auth";
import { validateReferralForSignup } from "@/lib/referrals";
import { useAuth } from "@/providers/AuthProvider";

type AuthMode = "login" | "signup";

const signupBonus = 50000;
const accessPhoneNumber = "918973016124";

export default function HomeScreen() {
  const { error, isLoading, user } = useAuth();
  const { width } = useWindowDimensions();
  const { mode: requestedMode } = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidatingReferral, setIsValidatingReferral] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validatedReferral, setValidatedReferral] = useState<{
    referralId: string;
    referredName: string | null;
    referrerDisplayName: string;
  } | null>(null);
  const [isReferralValidated, setIsReferralValidated] = useState(false);
  const isDesktop = width >= 1024;

  useEffect(() => {
    if (requestedMode === "login" || requestedMode === "signup") {
      setMode(requestedMode);
    }
  }, [requestedMode]);

  useEffect(() => {
    setValidatedReferral(null);
    setIsReferralValidated(false);
    setDisplayName("");
    setPassword("");
    setSubmitError(null);
  }, [mode]);

  async function handleValidateReferral() {
    setSubmitError(null);

    if (!phoneNumber.trim()) {
      const message = "Mobile number is required.";
      setSubmitError(message);
      Alert.alert("Missing details", message);
      return;
    }

    setIsValidatingReferral(true);

    try {
      const referral = await validateReferralForSignup(phoneNumber.trim());
      setValidatedReferral(referral);
      setIsReferralValidated(true);

      if (referral?.referredName) {
        setDisplayName(referral.referredName);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to validate referral right now.";
      setSubmitError(message);
      Alert.alert("Validation failed", message);
    } finally {
      setIsValidatingReferral(false);
    }
  }

  function handleContactAdmin() {
    const normalizedPhone = phoneNumber.trim() || "Unknown";
    const message = `Hi, I need access to FPL. My phone number is ${normalizedPhone}.`;
    const url = `https://wa.me/${accessPhoneNumber}?text=${encodeURIComponent(message)}`;
    void Linking.openURL(url);
  }

  async function handleSubmit() {
    setSubmitError(null);

    if (!phoneNumber.trim() || !password.trim()) {
      const message = "Mobile number and password are required.";
      setSubmitError(message);
      Alert.alert("Missing details", message);
      return;
    }

    if (mode === "signup" && !displayName.trim()) {
      const message = "Display name is required for sign up.";
      setSubmitError(message);
      Alert.alert("Missing details", message);
      return;
    }

    if (mode === "signup" && !validatedReferral) {
      const message = "Referral validation is required before sign up.";
      setSubmitError(message);
      Alert.alert("Referral required", message);
      return;
    }

    if (password.length < 6) {
      const message = "Password must be at least 6 characters.";
      setSubmitError(message);
      Alert.alert("Weak password", message);
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "signup") {
        await signUpWithPhone({
          displayName: displayName.trim(),
          phoneNumber: phoneNumber.trim(),
          password,
        });
      } else {
        await signInWithPhone({
          phoneNumber: phoneNumber.trim(),
          password,
        });
      }
    } catch (error) {
      const message = getAuthErrorMessage(error);
      setSubmitError(message);
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
          <Text style={styles.loadingText}>Connecting FPL...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (user) {
    return null;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <AppScreenBackground />
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollContentDesktop]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.pageShell, isDesktop && styles.pageShellDesktop]}>
            <StickyHeaderBar
              title="FPL"
              centered
            />

            <View style={styles.authContent}>
              <View style={styles.modeRow}>
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
              </View>

              <Text style={styles.label}>
                {mode === "signup" ? "CREATE ACCOUNT" : "WELCOME BACK"}
              </Text>

              {mode === "signup" ? (
                <>
                  {validatedReferral ? (
                    <>
                      <Text style={styles.fieldLabel}>Name</Text>
                      <TextInput
                        placeholder="Display name"
                        placeholderTextColor="#4C5D7C"
                        style={styles.input}
                        autoCapitalize="words"
                        value={displayName}
                        onChangeText={setDisplayName}
                      />

                      <Text style={styles.fieldLabel}>Number</Text>
                      <TextInput
                        placeholder="Mobile number"
                        placeholderTextColor="#4C5D7C"
                        style={styles.input}
                        keyboardType="phone-pad"
                        value={phoneNumber}
                        editable={false}
                      />

                      <Text style={styles.fieldLabel}>Password</Text>
                      <TextInput
                        placeholder="Password"
                        placeholderTextColor="#4C5D7C"
                        style={styles.input}
                        secureTextEntry
                        autoCapitalize="none"
                        value={password}
                        onChangeText={setPassword}
                      />
                    </>
                  ) : (
                    <>
                      <TextInput
                        placeholder="Mobile number"
                        placeholderTextColor="#4C5D7C"
                        style={styles.input}
                        keyboardType="phone-pad"
                        value={phoneNumber}
                        onChangeText={(value) => {
                          setPhoneNumber(value.replace(/[^0-9]/g, ""));
                          setValidatedReferral(null);
                          setIsReferralValidated(false);
                          setDisplayName("");
                          setPassword("");
                          setSubmitError(null);
                        }}
                      />

                      <Pressable
                        style={[
                          styles.button,
                          (isValidatingReferral || isSubmitting) && styles.buttonDisabled,
                        ]}
                        onPress={handleValidateReferral}
                        disabled={isValidatingReferral || isSubmitting}
                      >
                        <Text style={styles.buttonText}>
                          {isValidatingReferral ? "Validating..." : "Validate"}
                        </Text>
                      </Pressable>
                    </>
                  )}

                  {isReferralValidated && validatedReferral ? (
                    <View style={styles.successCard}>
                      <Text style={styles.successTitle}>Referral verified</Text>
                      <Text style={styles.successText}>
                        {validatedReferral.referrerDisplayName} has referred this number.
                      </Text>
                    </View>
                  ) : null}

                  {isReferralValidated && !validatedReferral ? (
                    <View style={styles.errorCard}>
                      <Text style={styles.errorText}>
                        No referral found for this number. Contact admin to get access credentials.
                      </Text>
                    </View>
                  ) : null}

                  {!validatedReferral && isReferralValidated ? (
                    <Pressable
                      style={[styles.secondaryActionButton, isSubmitting && styles.buttonDisabled]}
                      onPress={handleContactAdmin}
                      disabled={isSubmitting}
                    >
                      <Text style={styles.secondaryActionButtonText}>Connect To Admin</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <>
                  <TextInput
                    placeholder="Mobile number"
                    placeholderTextColor="#4C5D7C"
                    style={styles.input}
                    keyboardType="phone-pad"
                    value={phoneNumber}
                    onChangeText={(value) => setPhoneNumber(value.replace(/[^0-9]/g, ""))}
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
                </>
              )}

              <Text style={styles.helperText}>
                {mode === "signup"
                  ? validatedReferral
                    ? `Referred users receive ${signupBonus.toLocaleString("en-IN")} coins instantly.`
                    : "Enter your mobile number and validate referral access before creating an account."
                  : "Use the mobile number and password you registered with."}
              </Text>

              {error ? (
                <View style={styles.errorCard}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {submitError ? (
                <View style={styles.errorCard}>
                  <Text style={styles.errorText}>{submitError}</Text>
                </View>
              ) : null}

              {mode === "login" || validatedReferral ? (
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
              ) : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#07152E",
  },
  keyboardWrap: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 40,
  },
  scrollContentDesktop: {
    paddingTop: 40,
    paddingBottom: 56,
  },
  pageShell: {
    width: "100%",
    alignSelf: "center",
    gap: 18,
  },
  pageShellDesktop: {
    maxWidth: 760,
    gap: 20,
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
  titleDesktop: {
    fontSize: 38,
  },
  subtitle: {
    color: "#93A1BC",
    fontSize: 18,
    textAlign: "center",
    lineHeight: 28,
  },
  subtitleDesktop: {
    fontSize: 17,
    lineHeight: 26,
  },
  authContent: {
    paddingHorizontal: 2,
    marginTop: 18,
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
  fieldLabel: {
    color: "#94A4C0",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 2,
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
    marginBottom: 20,
  },
  errorCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#7A2A2A",
    backgroundColor: "#311515",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  errorText: {
    color: "#F0B3B3",
    fontSize: 15,
    lineHeight: 22,
  },
  successCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2B7B57",
    backgroundColor: "#123325",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
    gap: 4,
  },
  successTitle: {
    color: "#DDF7E7",
    fontSize: 15,
    fontWeight: "700",
  },
  successText: {
    color: "#BEEFD5",
    fontSize: 14,
    lineHeight: 20,
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
  secondaryActionButton: {
    height: 64,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2F4770",
    backgroundColor: "#132445",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  secondaryActionButtonText: {
    color: "#DDE5F7",
    fontSize: 18,
    fontWeight: "700",
  },
});

function getAuthErrorMessage(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error ? String(error.code) : null;

  switch (code) {
    case "auth/email-already-in-use":
      return "That mobile number is already registered. Try logging in instead.";
    case "auth/invalid-email":
      return "Unable to prepare mobile login for this account.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Incorrect mobile number or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a bit and try again.";
    case "auth/network-request-failed":
      return "Network request failed. Check your connection and try again.";
    default:
      return error instanceof Error ? error.message : "Unable to complete authentication.";
  }
}
