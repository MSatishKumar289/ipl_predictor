import { createElement } from "react";
import { Platform, StyleSheet, View } from "react-native";

const webHamburgerMarkup = `
<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 5.5H16" stroke="#DDE5F7" stroke-width="2" stroke-linecap="round"/>
  <path d="M4 10H16" stroke="#DDE5F7" stroke-width="2" stroke-linecap="round"/>
  <path d="M4 14.5H16" stroke="#DDE5F7" stroke-width="2" stroke-linecap="round"/>
</svg>
`;

export function HamburgerIcon() {
  if (Platform.OS === "web") {
    return createElement("img", {
      src: `data:image/svg+xml;utf8,${encodeURIComponent(webHamburgerMarkup)}`,
      width: 20,
      height: 20,
      alt: "Menu",
      style: { display: "block" },
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.line} />
      <View style={styles.line} />
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 20,
    height: 20,
    justifyContent: "center",
    gap: 3,
  },
  line: {
    height: 2,
    borderRadius: 999,
    backgroundColor: "#DDE5F7",
  },
});
