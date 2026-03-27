import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";

import { QuestionIcon } from "@/components/QuestionIcon";

type QuickRulesWidgetProps = {
  enabled: boolean;
  autoOpen: boolean;
  variant?: "help" | "admin";
};

const quickSteps = [
  "Start with 50,000 coins to play.",
  "Open any upcoming match from Home.",
  "Pick your team and enter your bet amount.",
  "Review your bet, then confirm and submit.",
  "Win your pick and grow your balance.",
];

export function QuickRulesWidget({
  enabled,
  autoOpen,
  variant = "help",
}: QuickRulesWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasAutoOpenedRef = useRef(false);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isAdmin = variant === "admin";

  useEffect(() => {
    if (!enabled) {
      setIsOpen(false);
      hasAutoOpenedRef.current = false;
      return;
    }

    if (autoOpen && !hasAutoOpenedRef.current) {
      setIsOpen(true);
      hasAutoOpenedRef.current = true;
    }
  }, [autoOpen, enabled]);

  if (!enabled) {
    return null;
  }

  if (isAdmin) {
    return (
      <Pressable
        style={[styles.fab, styles.adminFab, isDesktop ? styles.fabDesktop : null]}
        onPress={() => router.push("/admin")}
      >
        <Text style={styles.adminFabText}>AD</Text>
      </Pressable>
    );
  }

  return (
    <>
      <Pressable style={[styles.fab, isDesktop ? styles.fabDesktop : null]} onPress={() => setIsOpen(true)}>
        <QuestionIcon />
      </Pressable>

      <Modal animationType="fade" transparent visible={isOpen} onRequestClose={() => setIsOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setIsOpen(false)} />
          <View style={[styles.card, isDesktop ? styles.cardDesktop : null]}>
            <View style={styles.handle} />
            <Text style={styles.title}>Get Started with FPL</Text>
            <Text style={styles.subtitle}>Quick steps to place your first bet.</Text>

            <View style={styles.stepsCard}>
              {quickSteps.map((step, index) => (
                <View key={step} style={styles.stepRow}>
                  <Text style={styles.stepNumber}>{index + 1}.</Text>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>

            <Pressable style={styles.closeButton} onPress={() => setIsOpen(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 18,
    bottom: 96,
    width: 54,
    height: 54,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(72, 109, 184, 0.58)",
    backgroundColor: "rgba(27, 50, 97, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  adminFab: {
    backgroundColor: "rgba(26, 78, 168, 0.86)",
    borderColor: "rgba(113, 164, 255, 0.8)",
  },
  fabDesktop: {
    right: 28,
    bottom: 34,
  },
  adminFabText: {
    color: "#F6FAFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(2, 8, 20, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: "100%",
    maxWidth: 720,
    maxHeight: "86%",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#244171",
    backgroundColor: "#0D1A34",
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 12,
  },
  cardDesktop: {
    maxWidth: 760,
  },
  handle: {
    alignSelf: "center",
    width: 56,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#2C4677",
    marginBottom: 4,
  },
  title: {
    color: "#F5F8FF",
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: "#95A7C6",
    fontSize: 15,
    lineHeight: 22,
  },
  stepsCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#203861",
    backgroundColor: "#102042",
    padding: 18,
    gap: 12,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  stepNumber: {
    width: 18,
    color: "#7CA7FF",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 22,
  },
  stepText: {
    flex: 1,
    color: "#D7E1F5",
    fontSize: 15,
    lineHeight: 22,
  },
  closeButton: {
    alignSelf: "flex-end",
    minWidth: 120,
    borderRadius: 16,
    backgroundColor: "#2555C7",
    paddingHorizontal: 22,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    color: "#F6FAFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
