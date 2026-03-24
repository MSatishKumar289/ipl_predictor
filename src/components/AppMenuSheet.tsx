import { router, type Href, usePathname } from "expo-router";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { HamburgerIcon } from "@/components/HamburgerIcon";

const menuItems: { label: string; href: Href }[] = [
  { label: "Fixtures", href: "/fixtures" },
  { label: "Transactions", href: "/transactions" },
  { label: "My Referrals", href: "/my-referrals" },
  { label: "Refer a Friend", href: "/refer-a-friend" },
  { label: "How to Play", href: "/how-to-play" },
  { label: "Report a Bug", href: "/report-a-bug" },
  { label: "Privacy & Terms", href: "/privacy-terms" },
  { label: "Logout", href: "/logout" },
];

export function AppMenuButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.trigger} onPress={onPress}>
      <HamburgerIcon />
    </Pressable>
  );
}

export function AppMenuSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <SafeAreaView style={styles.safeWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Menu</Text>
              <Pressable style={styles.trigger} onPress={onClose}>
                <HamburgerIcon />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
            >
              {menuItems.map((item) => (
                (() => {
                  const isActive = pathname === item.href;

                  return (
                <Pressable
                  key={item.label}
                  style={[styles.item, isActive && styles.itemActive]}
                  onPress={() => {
                    onClose();
                    router.push(item.href);
                  }}
                >
                  <Text style={[styles.itemText, isActive && styles.itemTextActive]}>
                    {item.label}
                  </Text>
                </Pressable>
                  );
                })()
              ))}
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(3, 10, 20, 0.52)",
  },
  backdrop: {
    flex: 1,
  },
  safeWrap: {
    width: 312,
  },
  sheet: {
    flex: 1,
    backgroundColor: "#101A31",
    borderLeftWidth: 1,
    borderLeftColor: "#223A63",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 24,
    gap: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1C2A45",
  },
  sheetTitle: {
    color: "#F7FAFF",
    fontSize: 22,
    fontWeight: "800",
  },
  list: {
    gap: 10,
    paddingTop: 4,
  },
  item: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#13213F",
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  itemActive: {
    borderColor: "#3A6FE5",
    backgroundColor: "#17346A",
  },
  itemText: {
    color: "#DDE5F7",
    fontSize: 16,
    fontWeight: "700",
  },
  itemTextActive: {
    color: "#F7FAFF",
  },
  trigger: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    alignItems: "center",
    justifyContent: "center",
  },
});
