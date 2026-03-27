import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function RouteFallbackScreen({
  eyebrow,
  title,
  description,
  showAuthActions = false,
  primaryActionLabel = "Go To Home",
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  eyebrow: string;
  title: string;
  description: string;
  showAuthActions?: boolean;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{eyebrow}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          {showAuthActions ? (
            <View style={styles.actionRow}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => router.replace({ pathname: "/", params: { mode: "login" } })}
              >
                <Text style={styles.secondaryButtonText}>Go To Login</Text>
              </Pressable>
              <Pressable
                style={styles.primaryButton}
                onPress={() => router.replace({ pathname: "/", params: { mode: "signup" } })}
              >
                <Text style={styles.primaryButtonText}>Go To Register</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Pressable
                style={styles.primaryButton}
                onPress={onPrimaryAction ?? (() => router.replace("/(tabs)/home"))}
              >
                <Text style={styles.primaryButtonText}>{primaryActionLabel}</Text>
              </Pressable>
              {secondaryActionLabel && onSecondaryAction ? (
                <Pressable style={styles.linkButton} onPress={onSecondaryAction}>
                  <Text style={styles.linkButtonText}>{secondaryActionLabel}</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#07152E",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 18,
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2D4C7D",
    backgroundColor: "#102042",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  badgeText: {
    color: "#7FAAFF",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#101A31",
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 14,
  },
  title: {
    color: "#F7FAFF",
    fontSize: 30,
    fontWeight: "800",
  },
  description: {
    color: "#AFC0DE",
    fontSize: 16,
    lineHeight: 24,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: "#2463EB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 6,
  },
  primaryButtonText: {
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2A4F85",
    backgroundColor: "#13213F",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 6,
  },
  secondaryButtonText: {
    color: "#DDE5F7",
    fontSize: 15,
    fontWeight: "700",
  },
  linkButton: {
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  linkButtonText: {
    color: "#8FB4FF",
    fontSize: 14,
    fontWeight: "700",
  },
});
