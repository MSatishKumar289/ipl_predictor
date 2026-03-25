import { useState } from "react";
import { router, type Href, usePathname } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { HamburgerIcon } from "@/components/HamburgerIcon";
import { useAuth } from "@/providers/AuthProvider";
import { createReferral } from "@/lib/referrals";

const menuItems: { label: string; href?: Href; action?: () => Promise<void> }[] = [
  { label: "Fixtures", href: "/fixtures" },
  { label: "Transactions", href: "/transactions" },
  { label: "My Referrals", href: "/my-referrals" },
  { label: "Refer a Friend" },
  { label: "How to Play", href: "/how-to-play" },
  {
    label: "Report a Bug",
    action: async () => {
      const message = encodeURIComponent("There is bug which i have identified");
      const primaryUrl = `whatsapp://send?phone=918973016124&text=${message}`;
      const fallbackUrl = `https://wa.me/918973016124?text=${message}`;

      const canOpenPrimary = await Linking.canOpenURL(primaryUrl);
      await Linking.openURL(canOpenPrimary ? primaryUrl : fallbackUrl);
    },
  },
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
  const { user, profile } = useAuth();
  const [isReferModalOpen, setIsReferModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [friendName, setFriendName] = useState("");
  const [friendMobile, setFriendMobile] = useState("");
  const [isSubmittingReferral, setIsSubmittingReferral] = useState(false);

  async function handleSubmitReferral() {
    if (!user || !profile) {
      Alert.alert("Profile missing", "Please wait for your profile to load and try again.");
      return;
    }

    if (!friendMobile.trim()) {
      Alert.alert("Missing mobile number", "Enter a valid mobile number.");
      return;
    }

    try {
      setIsSubmittingReferral(true);

      await createReferral({
        referrerUserId: user.uid,
        referrerDisplayName: profile.displayName,
        referrerPhoneNumber: profile.phoneNumber ?? null,
        referredName: friendName,
        referredPhoneNumber: friendMobile,
      });

      setFriendName("");
      setFriendMobile("");
      setIsReferModalOpen(false);
      Alert.alert("Referral sent", "Your referral has been saved successfully.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to send referral right now.";
      Alert.alert("Referral failed", message);
    } finally {
      setIsSubmittingReferral(false);
    }
  }

  return (
    <>
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
                    const isActive = item.href ? pathname === item.href : false;

                    return (
                  <Pressable
                    key={item.label}
                    style={[styles.item, isActive && styles.itemActive]}
                    onPress={async () => {
                      onClose();

                      if (item.label === "Refer a Friend") {
                        setIsReferModalOpen(true);
                        return;
                      }

                      if (item.label === "Logout") {
                        setIsLogoutModalOpen(true);
                        return;
                      }

                      if (item.action) {
                        await item.action();
                        return;
                      }

                      if (item.href) {
                        router.push(item.href);
                      }
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

      <Modal
        visible={isReferModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsReferModalOpen(false)}
      >
        <View style={styles.referOverlay}>
          <Pressable style={styles.referBackdrop} onPress={() => setIsReferModalOpen(false)} />
          <View style={styles.referCard}>
            <View style={styles.referHandle} />
            <Text style={styles.referTitle}>Refer a Friend</Text>

            <TextInput
              style={styles.referInput}
              placeholder="Friend's Name"
              placeholderTextColor="#5F6B82"
              value={friendName}
              onChangeText={setFriendName}
            />

            <TextInput
              style={styles.referInput}
              placeholder="Friend's Mobile No*"
              placeholderTextColor="#5F6B82"
              keyboardType="phone-pad"
              value={friendMobile}
              onChangeText={(value) => setFriendMobile(value.replace(/[^0-9]/g, ""))}
            />

            <Text style={styles.referHelperText}>
              Enter only 10 digit mobile no without space or +91
            </Text>

            <View style={styles.referActionRow}>
              <Pressable
                style={styles.referSecondaryButton}
                onPress={() => setIsReferModalOpen(false)}
                disabled={isSubmittingReferral}
              >
                <Text style={styles.referSecondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.referSubmitButton, isSubmittingReferral && styles.buttonDisabled]}
                onPress={handleSubmitReferral}
                disabled={isSubmittingReferral}
              >
                {isSubmittingReferral ? (
                  <ActivityIndicator size="small" color="#F7FAFF" />
                ) : (
                  <Text style={styles.referSubmitButtonText}>Submit</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isLogoutModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsLogoutModalOpen(false)}
      >
        <View style={styles.logoutOverlay}>
          <Pressable style={styles.logoutBackdrop} onPress={() => setIsLogoutModalOpen(false)} />
          <View style={styles.logoutCard}>
            <Text style={styles.logoutTitle}>Logout</Text>
            <Text style={styles.logoutText}>Do you want to logout from the app?</Text>

            <View style={styles.logoutActionRow}>
              <Pressable
                style={styles.logoutSecondaryButton}
                onPress={() => setIsLogoutModalOpen(false)}
              >
                <Text style={styles.logoutSecondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.logoutPrimaryButton}
                onPress={() => {
                  setIsLogoutModalOpen(false);
                  router.push("/logout");
                }}
              >
                <Text style={styles.logoutPrimaryButtonText}>Logout</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
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
  referOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(3, 10, 20, 0.58)",
  },
  referBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  referCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#101A31",
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 22,
    gap: 14,
  },
  referHandle: {
    alignSelf: "center",
    width: 84,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#324562",
    marginBottom: 6,
  },
  referTitle: {
    color: "#F7FAFF",
    fontSize: 22,
    fontWeight: "800",
  },
  referInput: {
    height: 58,
    borderRadius: 16,
    backgroundColor: "#162645",
    borderWidth: 1,
    borderColor: "#334C76",
    paddingHorizontal: 16,
    color: "#F7FAFF",
    fontSize: 16,
  },
  referHelperText: {
    color: "#93A1BC",
    fontSize: 14,
    lineHeight: 20,
    marginTop: -4,
  },
  referActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 4,
  },
  referSecondaryButton: {
    height: 46,
    borderRadius: 14,
    backgroundColor: "#1B2740",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  referSecondaryButtonText: {
    color: "#D7E1F5",
    fontSize: 15,
    fontWeight: "700",
  },
  referSubmitButton: {
    height: 46,
    borderRadius: 14,
    backgroundColor: "#2463EB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  referSubmitButtonText: {
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  logoutOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(3, 10, 20, 0.58)",
  },
  logoutBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  logoutCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#101A31",
    padding: 22,
    gap: 14,
  },
  logoutTitle: {
    color: "#F7FAFF",
    fontSize: 22,
    fontWeight: "800",
  },
  logoutText: {
    color: "#AFC0DE",
    fontSize: 15,
    lineHeight: 22,
  },
  logoutActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 4,
  },
  logoutSecondaryButton: {
    height: 46,
    borderRadius: 14,
    backgroundColor: "#1B2740",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  logoutSecondaryButtonText: {
    color: "#D7E1F5",
    fontSize: 15,
    fontWeight: "700",
  },
  logoutPrimaryButton: {
    height: 46,
    borderRadius: 14,
    backgroundColor: "#2463EB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  logoutPrimaryButtonText: {
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "800",
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
