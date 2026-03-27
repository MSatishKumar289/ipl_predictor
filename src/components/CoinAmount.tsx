import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";

function CoinIcon({
  size,
  style,
}: {
  size: number;
  style?: ViewStyle;
}) {
  const innerSize = Math.max(6, Math.round(size * 0.52));

  return (
    <View
      style={[
        styles.coinOuter,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.coinInner,
          {
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
          },
        ]}
      />
    </View>
  );
}

export function CoinAmount({
  value,
  prefix,
  color = "#F7FAFF",
  size = 16,
  weight = "700",
  iconSize,
  align = "left",
  style,
  textStyle,
}: {
  value: string;
  prefix?: "+" | "-";
  color?: string;
  size?: number;
  weight?: TextStyle["fontWeight"];
  iconSize?: number;
  align?: "left" | "center" | "right";
  style?: ViewStyle;
  textStyle?: TextStyle;
}) {
  const resolvedIconSize = iconSize ?? Math.max(12, Math.round(size * 0.8));

  return (
    <View
      style={[
        styles.row,
        align === "center" && styles.rowCenter,
        align === "right" && styles.rowRight,
        style,
      ]}
    >
      {prefix ? (
        <Text style={[styles.prefixText, { color, fontSize: size, fontWeight: weight }, textStyle]}>
          {prefix}
        </Text>
      ) : null}
      <CoinIcon size={resolvedIconSize} />
      <Text
        style={[
          styles.valueText,
          {
            color,
            fontSize: size,
            fontWeight: weight,
            textAlign: align,
          },
          textStyle,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    flexShrink: 1,
  },
  rowCenter: {
    justifyContent: "center",
  },
  rowRight: {
    justifyContent: "flex-end",
  },
  coinOuter: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F6C64A",
    borderWidth: 1,
    borderColor: "#D99B1F",
    shadowColor: "#2A1B00",
    shadowOpacity: 0.24,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  coinInner: {
    backgroundColor: "#FFE38E",
    borderWidth: 1,
    borderColor: "rgba(217, 155, 31, 0.45)",
  },
  prefixText: {
    includeFontPadding: false,
    flexShrink: 0,
  },
  valueText: {
    includeFontPadding: false,
    flexShrink: 1,
  },
});
