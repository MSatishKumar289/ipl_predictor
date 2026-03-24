import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppMenuButton, AppMenuSheet } from "@/components/AppMenuSheet";
import { BackButton } from "@/components/BackButton";

export default function ReferAFriendScreen() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [friendName, setFriendName] = useState("");
  const [friendMobile, setFriendMobile] = useState("");

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pageShell}>
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <BackButton fallbackHref="/(tabs)/home" />
              <View style={styles.headerTextWrap}>
                <Text style={styles.eyebrow}>Menu</Text>
                <Text style={styles.title}>Refer a Friend</Text>
              </View>
              <AppMenuButton onPress={() => setIsMenuOpen(true)} />
            </View>
            <Text style={styles.subtitle}>
              Invite a friend and keep the referral details ready for submission.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Referral Form</Text>
            <Text style={styles.cardText}>
              Open the form below and enter your friend&apos;s details.
            </Text>

            <Pressable style={styles.primaryButton} onPress={() => setIsModalOpen(true)}>
              <Text style={styles.primaryButtonText}>Open Referral Popup</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={isModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsModalOpen(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Refer a Friend</Text>

            <TextInput
              style={styles.input}
              placeholder="Friend's Name*"
              placeholderTextColor="#5F6B82"
              value={friendName}
              onChangeText={setFriendName}
            />

            <TextInput
              style={styles.input}
              placeholder="Friend's Mobile No*"
              placeholderTextColor="#5F6B82"
              keyboardType="phone-pad"
              value={friendMobile}
              onChangeText={(value) => setFriendMobile(value.replace(/[^0-9]/g, ""))}
            />

            <Text style={styles.helperText}>
              Enter only 10 digit mobile no without space or +91
            </Text>

            <View style={styles.actionRow}>
              <Pressable style={styles.secondaryButton} onPress={() => setIsModalOpen(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.submitButton}>
                <Text style={styles.submitButtonText}>Submit</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <AppMenuSheet visible={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#091327",
  },
  content: {
    padding: 24,
    paddingTop: 36,
    paddingBottom: 40,
  },
  pageShell: {
    width: "100%",
    maxWidth: 960,
    alignSelf: "center",
    gap: 22,
  },
  header: {
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  headerTextWrap: {
    flex: 1,
    gap: 6,
  },
  eyebrow: {
    color: "#3F7DFF",
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  title: {
    color: "#F5F8FF",
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: "#8EA0C1",
    fontSize: 16,
    lineHeight: 24,
    paddingRight: 8,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 22,
    gap: 12,
  },
  cardTitle: {
    color: "#F7FAFF",
    fontSize: 22,
    fontWeight: "700",
  },
  cardText: {
    color: "#9FB0CF",
    fontSize: 15,
    lineHeight: 22,
  },
  primaryButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    height: 50,
    borderRadius: 14,
    backgroundColor: "#1E5AE0",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "800",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(3, 10, 20, 0.58)",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#101A31",
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 22,
    gap: 14,
  },
  modalHandle: {
    alignSelf: "center",
    width: 84,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#324562",
    marginBottom: 6,
  },
  modalTitle: {
    color: "#F7FAFF",
    fontSize: 22,
    fontWeight: "800",
  },
  input: {
    height: 58,
    borderRadius: 16,
    backgroundColor: "#162645",
    borderWidth: 1,
    borderColor: "#334C76",
    paddingHorizontal: 16,
    color: "#F7FAFF",
    fontSize: 16,
  },
  helperText: {
    color: "#93A1BC",
    fontSize: 14,
    lineHeight: 20,
    marginTop: -4,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 4,
  },
  secondaryButton: {
    height: 46,
    borderRadius: 14,
    backgroundColor: "#1B2740",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: "#D7E1F5",
    fontSize: 15,
    fontWeight: "700",
  },
  submitButton: {
    height: 46,
    borderRadius: 14,
    backgroundColor: "#2463EB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  submitButtonText: {
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
