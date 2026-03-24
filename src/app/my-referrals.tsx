import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";

import { AppMenuButton, AppMenuSheet } from "@/components/AppMenuSheet";
import { BackButton } from "@/components/BackButton";

export default function MyReferralsScreen() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pageShell}>
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <BackButton fallbackHref="/(tabs)/home" />
              <View style={styles.headerTextWrap}>
                <Text style={styles.eyebrow}>Menu</Text>
                <Text style={styles.title}>My Referrals</Text>
              </View>
              <AppMenuButton onPress={() => setIsMenuOpen(true)} />
            </View>
            <Text style={styles.subtitle}>
              Track referred friends, bonus credit status, and referral activity.
            </Text>
          </View>

          <View style={styles.tableWrap}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.nameCol]}>Name</Text>
              <Text style={[styles.tableHeaderText, styles.mobileCol]}>Mobile</Text>
              <Text style={[styles.tableHeaderText, styles.bonusCol]}>Bonus Credited</Text>
              <Text style={[styles.tableHeaderText, styles.dateCol]}>Date Time</Text>
            </View>

            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>No data found.</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <AppMenuSheet visible={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#091327",
  },
  content: {
    padding: 24,
    paddingTop: 36,
    paddingBottom: 40,
  },
  pageShell: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    gap: 22,
  },
  header: {
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  headerTextWrap: {
    flex: 1,
    gap: 6,
  },
  eyebrow: {
    color: "#3F7DFF",
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  title: {
    color: "#F5F8FF",
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: "#8EA0C1",
    fontSize: 16,
    lineHeight: 24,
    paddingRight: 8,
  },
  tableWrap: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "#132445",
    borderBottomWidth: 1,
    borderBottomColor: "#223A63",
    gap: 12,
  },
  tableHeaderText: {
    color: "#7FAAFF",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  nameCol: {
    flex: 1.3,
  },
  mobileCol: {
    width: 170,
  },
  bonusCol: {
    width: 160,
  },
  dateCol: {
    width: 120,
  },
  emptyRow: {
    paddingVertical: 28,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: "#DDE5F7",
    fontSize: 16,
    fontWeight: "500",
  },
});
