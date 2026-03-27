import { createElement } from "react";
import { Platform, StyleSheet, View } from "react-native";

const webCloseIconMarkup = `
<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M5.5 5.5L14.5 14.5" stroke="#DDE5F7" stroke-width="2" stroke-linecap="round"/>
  <path d="M14.5 5.5L5.5 14.5" stroke="#DDE5F7" stroke-width="2" stroke-linecap="round"/>
</svg>
`;

export function CloseIcon() {
  if (Platform.OS === "web") {
    return createElement("img", {
      src: `data:image/svg+xml;utf8,${encodeURIComponent(webCloseIconMarkup)}`,
      width: 20,
      height: 20,
      alt: "Close",
      style: { display: "block" },
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.line, styles.lineTop]} />
      <View style={[styles.line, styles.lineBottom]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  line: {
    position: "absolute",
    width: 14,
    height: 2,
    borderRadius: 999,
    backgroundColor: "#DDE5F7",
  },
  lineTop: {
    transform: [{ rotate: "45deg" }],
  },
  lineBottom: {
    transform: [{ rotate: "-45deg" }],
  },
});
