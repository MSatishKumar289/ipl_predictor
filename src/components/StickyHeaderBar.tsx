import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

type StickyHeaderBarProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  centered?: boolean;
  edgeToEdge?: boolean;
};

export function StickyHeaderBar({
  eyebrow,
  title,
  subtitle,
  leftSlot,
  rightSlot,
  centered = false,
  edgeToEdge = false,
}: StickyHeaderBarProps) {
  const hasLeftSlot = !!leftSlot;
  const hasRightSlot = !!rightSlot;
  const hasEyebrow = !!eyebrow;

  return (
    <View style={styles.stickyWrap}>
      <View
        style={[
          styles.shell,
          centered && styles.shellCentered,
          edgeToEdge && styles.shellEdgeToEdge,
        ]}
      >
        {hasLeftSlot ? <View style={styles.sideSlot}>{leftSlot}</View> : null}
        <View style={[styles.copyWrap, centered && styles.copyWrapCentered]}>
          {hasEyebrow ? (
            <View style={styles.eyebrowRow}>
              <View style={styles.eyebrowDot} />
              <Text style={[styles.eyebrow, centered && styles.copyCentered]}>{eyebrow}</Text>
            </View>
          ) : null}
          <Text style={[styles.title, centered && styles.copyCentered]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, centered && styles.copyCentered]}>{subtitle}</Text>
          ) : null}
        </View>
        {hasRightSlot ? <View style={[styles.sideSlot, styles.sideSlotRight]}>{rightSlot}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stickyWrap: {
    paddingBottom: 14,
    backgroundColor: "transparent",
  },
  shell: {
    minHeight: 74,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(112, 150, 214, 0.18)",
    backgroundColor: "#142847",
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#020812",
    shadowOpacity: 0.34,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  shellCentered: {
    justifyContent: "center",
  },
  shellEdgeToEdge: {
    borderRadius: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(242, 184, 75, 0.22)",
    paddingHorizontal: 36,
    paddingTop: 20,
    paddingBottom: 20,
  },
  sideSlot: {
    minWidth: 42,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  sideSlotRight: {
    alignItems: "flex-end",
  },
  copyWrap: {
    flex: 1,
    gap: 4,
  },
  copyWrapCentered: {
    alignItems: "center",
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eyebrowDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#F2B84B",
  },
  eyebrow: {
    color: "#F2B84B",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: {
    color: "#F5F8FF",
    fontSize: 23,
    fontWeight: "800",
  },
  subtitle: {
    color: "#9FB0CF",
    fontSize: 13,
    lineHeight: 19,
  },
  copyCentered: {
    textAlign: "center",
  },
});
