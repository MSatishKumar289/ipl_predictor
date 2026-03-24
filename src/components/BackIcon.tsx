import { createElement } from "react";
import { Platform, StyleSheet, View } from "react-native";

const webBackIconMarkup = `
<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path
    d="M12.5 4.16669L6.66669 10L12.5 15.8334"
    stroke="#DDE5F7"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
`;

export function BackIcon() {
  if (Platform.OS === "web") {
    return createElement("img", {
      src: `data:image/svg+xml;utf8,${encodeURIComponent(webBackIconMarkup)}`,
      width: 20,
      height: 20,
      alt: "Back",
      style: { display: "block" },
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.stem} />
      <View style={[styles.arm, styles.armTop]} />
      <View style={[styles.arm, styles.armBottom]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 20,
    height: 20,
    justifyContent: "center",
  },
  stem: {
    position: "absolute",
    left: 7,
    width: 9,
    height: 2,
    borderRadius: 999,
    backgroundColor: "#DDE5F7",
  },
  arm: {
    position: "absolute",
    left: 5,
    width: 8,
    height: 2,
    borderRadius: 999,
    backgroundColor: "#DDE5F7",
  },
  armTop: {
    transform: [{ rotate: "-45deg" }],
    top: 6,
  },
  armBottom: {
    transform: [{ rotate: "45deg" }],
    bottom: 6,
  },
});
