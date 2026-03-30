import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";

import { AppMenuButton, AppMenuSheet } from "@/components/AppMenuSheet";
import { AppScreenBackground } from "@/components/AppScreenBackground";
import { BackButton } from "@/components/BackButton";
import { StickyHeaderBar } from "@/components/StickyHeaderBar";
import { howToPlaySections as sections } from "@/lib/how-to-play-content";

export default function HowToPlayScreen() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <SafeAreaView style={styles.screen}>
      <AppScreenBackground />
      <View style={styles.topBannerWrap}>
        <StickyHeaderBar
          title="How to Play"
          leftSlot={<BackButton fallbackHref="/(tabs)/home" />}
          rightSlot={<AppMenuButton onPress={() => setIsMenuOpen(true)} />}
          edgeToEdge
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageShell}>
          {sections.map((section) => (
            <View key={section.title} style={styles.card}>
              <Text style={styles.cardTitle}>{section.title}</Text>
              <View style={styles.list}>
                {section.items.map((item) => (
                  <View key={item} style={styles.listItem}>
                    <View style={styles.listDot} />
                    <Text style={styles.listText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
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
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 14,
  },
  topBannerWrap: {
    marginHorizontal: -24,
  },
  pageShell: {
    width: "100%",
    maxWidth: 960,
    alignSelf: "center",
    gap: 18,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 22,
    gap: 14,
  },
  cardTitle: {
    color: "#F7FAFF",
    fontSize: 20,
    fontWeight: "800",
  },
  list: {
    gap: 12,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  listDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#3F7DFF",
    marginTop: 7,
  },
  listText: {
    flex: 1,
    color: "#D7E1F5",
    fontSize: 15,
    lineHeight: 22,
  },
});
