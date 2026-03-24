import { router, type Href } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

import { BackIcon } from "@/components/BackIcon";

export function BackButton({ fallbackHref }: { fallbackHref: Href }) {
  return (
    <Pressable
      style={styles.backButton}
      onPress={() => {
        router.replace(fallbackHref);
      }}
    >
      <BackIcon />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#102042",
    borderWidth: 1,
    borderColor: "#223A63",
    marginTop: 2,
  },
});
