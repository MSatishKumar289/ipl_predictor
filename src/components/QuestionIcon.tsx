import { createElement } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

const webQuestionIconMarkup = `
<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="10" cy="10" r="8.5" stroke="#F5F8FF" stroke-width="1.8"/>
  <path
    d="M7.9 7.35C7.9 6.08 8.88 5.2 10.21 5.2C11.48 5.2 12.36 6 12.36 7.1C12.36 8.04 11.87 8.61 10.95 9.19C10.04 9.76 9.72 10.18 9.72 11.05V11.3"
    stroke="#F5F8FF"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <circle cx="9.95" cy="14.4" r="1.1" fill="#F5F8FF"/>
</svg>
`;

export function QuestionIcon() {
  if (Platform.OS === "web") {
    return createElement("img", {
      src: `data:image/svg+xml;utf8,${encodeURIComponent(webQuestionIconMarkup)}`,
      width: 20,
      height: 20,
      alt: "Rules",
      style: { display: "block" },
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.circle}>
        <Text style={styles.questionMark}>?</Text>
      </View>
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
  circle: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1.8,
    borderColor: "#F5F8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  questionMark: {
    color: "#F5F8FF",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 14,
    marginTop: -1,
  },
});
