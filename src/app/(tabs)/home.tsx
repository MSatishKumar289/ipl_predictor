import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/providers/AuthProvider";

export default function HomeTab() {
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.content, isDesktop && styles.contentDesktop]}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>IPL Predictor</Text>
          <Text style={styles.title}>Welcome back, {profile?.displayName || "Player"}</Text>
          <Text style={styles.subtitle}>
            This is the authenticated app shell. Next we plug in upcoming matches,
            wallet stats, and leaderboard highlights.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Current Balance</Text>
          <Text style={styles.cardValue}>
            Rs. {(profile?.balance ?? 0).toLocaleString("en-IN")}
          </Text>
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
    padding: 24,
    gap: 18,
    width: "100%",
    alignSelf: "center",
  },
  contentDesktop: {
    maxWidth: 960,
  },
  hero: {
    paddingTop: 40,
    gap: 8,
  },
  eyebrow: {
    color: "#1E5AE0",
    fontSize: 15,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: {
    color: "#F5F7FB",
    fontSize: 32,
    fontWeight: "800",
  },
  subtitle: {
    color: "#93A1BC",
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 22,
    gap: 6,
  },
  cardLabel: {
    color: "#9FB0CF",
    fontSize: 16,
  },
  cardValue: {
    color: "#F7FAFF",
    fontSize: 28,
    fontWeight: "800",
  },
});
