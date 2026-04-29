import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { collection, doc, limit, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";

import { db } from "@/lib/firebase";

type BonusNotice = {
  id: string;
  title?: string;
  message?: string;
  reason?: string;
  points?: number;
  coins?: number;
  seen?: boolean;
};

export function BonusNoticePopup({ userId }: { userId?: string }) {
  const [notice, setNotice] = useState<BonusNotice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!userId) {
      setNotice(null);
      setIsLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      query(
        collection(db, "user_notifications"),
        where("userId", "==", userId),
        where("seen", "==", false),
        limit(1)
      ),
      (snapshot) => {
        const entry = snapshot.docs[0];
        if (!entry) {
          setNotice(null);
          setIsLoading(false);
          return;
        }
        setNotice({
          id: entry.id,
          ...(entry.data() as Omit<BonusNotice, "id">),
        });
        setIsLoading(false);
      },
      () => {
        setNotice(null);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [userId]);

  const visible = useMemo(() => !!notice && !isLoading, [notice, isLoading]);

  async function handleDismiss() {
    if (!notice || isClosing) {
      return;
    }

    try {
      setIsClosing(true);
      await updateDoc(doc(db, "user_notifications", notice.id), {
        seen: true,
        seenAt: serverTimestamp(),
      });
      setNotice(null);
    } finally {
      setIsClosing(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => void handleDismiss()}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={() => void handleDismiss()} />
        <View style={styles.card}>
          <Text style={styles.title}>{notice?.title ?? "Bonus Received"}</Text>
          <Text style={styles.message}>{notice?.message ?? "You received an admin bonus."}</Text>
          {notice?.reason ? (
            <>
              <Text style={styles.reasonLabel}>Reason</Text>
              <Text style={styles.reasonText}>{notice.reason}</Text>
            </>
          ) : null}
          <Pressable style={[styles.button, isClosing && styles.buttonDisabled]} onPress={() => void handleDismiss()}>
            {isClosing ? (
              <ActivityIndicator size="small" color="#F7FAFF" />
            ) : (
              <Text style={styles.buttonText}>OK</Text>
            )}
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
    backgroundColor: "rgba(7, 14, 28, 0.62)",
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
    fontSize: 22,
    fontWeight: "800",
  },
  message: {
    color: "#D6E3FA",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  reasonLabel: {
    color: "#8FB2FF",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 4,
  },
  reasonText: {
    color: "#E6EEFF",
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    marginTop: 8,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#1E5AE0",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
