import { createElement } from "react";
import { Platform, StyleSheet, View } from "react-native";

const webEditIconMarkup = `
<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path
    d="M11.1667 5.50002L14.5 8.83335"
    stroke="#DDE5F7"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M4.99998 15H8.01248C8.45248 15 8.87081 14.825 9.18165 14.5142L14.9916 8.70419C15.675 8.02085 15.675 6.91252 14.9916 6.22919L13.7708 5.00835C13.0875 4.32502 11.9791 4.32502 11.2958 5.00835L5.48581 10.8184C5.17498 11.1292 4.99998 11.5475 4.99998 11.9875V15Z"
    stroke="#DDE5F7"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
`;

export function EditIcon() {
  if (Platform.OS === "web") {
    return createElement("img", {
      src: `data:image/svg+xml;utf8,${encodeURIComponent(webEditIconMarkup)}`,
      width: 20,
      height: 20,
      alt: "Edit",
      style: { display: "block" },
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.body} />
      <View style={styles.tip} />
      <View style={styles.spark} />
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
  body: {
    position: "absolute",
    width: 12,
    height: 3,
    borderRadius: 999,
    backgroundColor: "#DDE5F7",
    transform: [{ rotate: "-45deg" }],
  },
  tip: {
    position: "absolute",
    right: 2,
    top: 4,
    width: 0,
    height: 0,
    borderLeftWidth: 0,
    borderRightWidth: 4,
    borderTopWidth: 2.5,
    borderBottomWidth: 2.5,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: "#DDE5F7",
    transform: [{ rotate: "-45deg" }],
  },
  spark: {
    position: "absolute",
    left: 3,
    bottom: 4,
    width: 5,
    height: 2,
    borderRadius: 999,
    backgroundColor: "#DDE5F7",
    transform: [{ rotate: "-45deg" }],
  },
});
