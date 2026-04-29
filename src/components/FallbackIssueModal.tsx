import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import type { FallbackIssue } from "@/lib/error-fallback";

export function FallbackIssueModal({
  issue,
  onClose,
}: {
  issue: FallbackIssue | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={!!issue} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.title}>{issue?.title ?? "Please Try Again"}</Text>
          <Text style={styles.message}>{issue?.message ?? "Please try again after some time."}</Text>
          <Pressable style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7, 14, 28, 0.66)",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#385A90",
    backgroundColor: "#162D52",
    padding: 20,
    gap: 10,
  },
  title: {
    color: "#F7FAFF",
    fontSize: 21,
    fontWeight: "800",
  },
  message: {
    color: "#D6E3FA",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  button: {
    marginTop: 8,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#1E5AE0",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "800",
  },
});

