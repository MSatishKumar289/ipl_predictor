import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export default function MatchesTab() {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Matches</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Upcoming + My Predictions</Text>
        <Text style={styles.cardText}>
          This screen will read Firestore matches, enforce 5-minute lock windows, and
          show prediction visibility after lock.
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
