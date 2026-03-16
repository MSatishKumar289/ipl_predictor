import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { logout } from "@/lib/auth";
import { useAuth } from "@/providers/AuthProvider";

export default function ProfileTab() {
  const { profile } = useAuth();

  async function handleLogout() {
    try {
      await logout();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign out.";
      Alert.alert("Sign out failed", message);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Profile</Text>
      <View style={styles.card}>
        <Text style={styles.name}>{profile?.displayName || "Player"}</Text>
        <Text style={styles.meta}>{profile?.email || "No email"}</Text>
        <Text style={styles.meta}>Wins: {profile?.wins ?? 0}</Text>
        <Text style={styles.meta}>Losses: {profile?.losses ?? 0}</Text>
        <Text style={styles.meta}>Predictions: {profile?.totalPredictions ?? 0}</Text>
        <Pressable style={styles.button} onPress={handleLogout}>
          <Text style={styles.buttonText}>Sign Out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#07152E",
    padding: 24,
    paddingTop: 48,
  },
  title: {
    color: "#F5F7FB",
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 18,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 22,
    gap: 8,
  },
  name: {
    color: "#F7FAFF",
    fontSize: 24,
    fontWeight: "800",
  },
  meta: {
    color: "#9FB0CF",
    fontSize: 16,
  },
  button: {
    marginTop: 14,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E5AE0",
  },
  buttonText: {
    color: "#F7FAFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
