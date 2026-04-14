import { StyleSheet, View } from "react-native";

export function AppScreenBackground() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]}>
      <View style={styles.base} />
      <View style={[styles.orb, styles.orbPrimary]} />
      <View style={[styles.orb, styles.orbWarm]} />
      <View style={[styles.orb, styles.orbCool]} />
      <View style={styles.softLift} />
      <View style={styles.grid} />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
    pointerEvents: "none",
  },
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0B1730",
  },
  orb: {
    position: "absolute",
    borderRadius: 999,
  },
  orbPrimary: {
    width: 280,
    height: 280,
    top: -72,
    left: -84,
    backgroundColor: "rgba(76, 126, 214, 0.14)",
  },
  orbWarm: {
    width: 240,
    height: 240,
    top: 110,
    right: -96,
    backgroundColor: "rgba(196, 150, 76, 0.1)",
  },
  orbCool: {
    width: 220,
    height: 220,
    bottom: 48,
    left: -72,
    backgroundColor: "rgba(72, 156, 130, 0.08)",
  },
  softLift: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.08)",
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.05,
    backgroundColor: "transparent",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.025)",
  },
});
