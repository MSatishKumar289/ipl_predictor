import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export default function LeaderboardTab() {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Leaderboard</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Weekly, Monthly, All Time</Text>
        <Text style={styles.cardText}>
          Rankings will be points-based with eligibility thresholds and public standings.
        </Text>
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
    gap: 10,
  },
  cardTitle: {
    color: "#F7FAFF",
    fontSize: 20,
    fontWeight: "700",
  },
  cardText: {
    color: "#9FB0CF",
    fontSize: 16,
    lineHeight: 24,
  },
});
