import { createElement } from "react";
import { Platform, StyleSheet, View } from "react-native";

const webLockIconMarkup = `
<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="6" width="8" height="6" rx="1.8" stroke="#A8B5D0" stroke-width="1.5"/>
  <path d="M4.5 6V4.8C4.5 3.41427 5.61427 2.3 7 2.3C8.38573 2.3 9.5 3.41427 9.5 4.8V6" stroke="#A8B5D0" stroke-width="1.5" stroke-linecap="round"/>
</svg>
`;

export function LockIcon() {
  if (Platform.OS === "web") {
    return createElement("img", {
      src: `data:image/svg+xml;utf8,${encodeURIComponent(webLockIconMarkup)}`,
      width: 14,
      height: 14,
      alt: "Lock",
      style: { display: "block" },
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.shackle} />
      <View style={styles.body} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  shackle: {
    position: "absolute",
    top: 1,
    width: 6,
    height: 5,
    borderWidth: 1.5,
    borderColor: "#A8B5D0",
    borderBottomWidth: 0,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  body: {
    width: 8,
    height: 6,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: "#A8B5D0",
    backgroundColor: "transparent",
  },
});
