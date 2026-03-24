import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BackButton } from "@/components/BackButton";
import { AppMenuButton, AppMenuSheet } from "@/components/AppMenuSheet";

export function PlaceholderScreen({
  title,
  eyebrow,
  subtitle,
}: {
  title: string;
  eyebrow: string;
  subtitle: string;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pageShell}>
          <View style={styles.headerRow}>
            <BackButton fallbackHref="/(tabs)/home" />
            <View style={styles.headerTextWrap}>
              <Text style={styles.eyebrow}>{eyebrow}</Text>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <AppMenuButton onPress={() => setIsMenuOpen(true)} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardText}>This screen is ready. Content will be added next.</Text>
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
    maxWidth: 960,
    alignSelf: "center",
    gap: 22,
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
    fontSize: 22,
    fontWeight: "700",
  },
  cardText: {
    color: "#9FB0CF",
    fontSize: 15,
    lineHeight: 22,
  },
});
