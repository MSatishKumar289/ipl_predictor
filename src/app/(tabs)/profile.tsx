import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { router, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState } from "react";

import { AppMenuButton, AppMenuSheet } from "@/components/AppMenuSheet";
import { CloseIcon } from "@/components/CloseIcon";
import { CoinAmount } from "@/components/CoinAmount";
import { EditIcon } from "@/components/EditIcon";
import { updateCurrentUserDisplayName } from "@/lib/auth";
import { useAuth } from "@/providers/AuthProvider";

export default function ProfileTab() {
  const { user, profile, error } = useAuth();
  const { width } = useWindowDimensions();
  const logoutRoute = "/logout" as Href;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditNameOpen, setIsEditNameOpen] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);
  const isDesktop = width >= 1024;

  useEffect(() => {
    setDisplayNameDraft(profile?.displayName ?? "");
  }, [profile?.displayName]);

  async function handleSaveDisplayName() {
    setNameMessage(null);

    if (!user || !profile) {
      const message = "Your profile is still loading. Try again in a moment.";
      setNameMessage({ tone: "error", text: message });
      Alert.alert("Profile missing", message);
      return;
    }

    const nextDisplayName = displayNameDraft.trim();

    if (!nextDisplayName) {
      const message = "Display name cannot be empty.";
      setNameMessage({ tone: "error", text: message });
      Alert.alert("Invalid name", message);
      return;
    }

    if (nextDisplayName === profile.displayName) {
      const message = "Enter a different name to update your profile.";
      setNameMessage({ tone: "error", text: message });
      Alert.alert("No changes", message);
      return;
    }

    try {
      setIsSavingName(true);
      await updateCurrentUserDisplayName(user, nextDisplayName);
      setNameMessage({ tone: "success", text: "Your display name has been updated." });
      setIsEditNameOpen(false);
      Alert.alert("Name updated", "Your display name has been updated.");
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Unable to update your display name.";
      setNameMessage({ tone: "error", text: message });
      Alert.alert("Update failed", message);
    } finally {
      setIsSavingName(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.pageShell, isDesktop && styles.pageShellDesktop]}>
          <View style={[styles.header, isDesktop && styles.headerDesktop]}>
            <View style={[styles.headerTopRow, isDesktop && styles.headerTopRowDesktop]}>
              <View style={styles.headerTextWrap}>
                <Text style={[styles.eyebrow, isDesktop && styles.headerTextDesktop]}>Account</Text>
                <Text style={[styles.title, isDesktop && styles.headerTextDesktop]}>Profile</Text>
                <Text style={[styles.subtitle, isDesktop && styles.headerTextDesktop]}>
                  Track your balance, results, and account status.
                </Text>
              </View>
              <AppMenuButton onPress={() => setIsMenuOpen(true)} />
            </View>
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Profile sync error</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.heroCard}>
            <Pressable
              style={styles.editTrigger}
              onPress={() => {
                setNameMessage(null);
                setDisplayNameDraft(profile?.displayName ?? "");
                setIsEditNameOpen(true);
              }}
            >
              <EditIcon />
            </Pressable>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(profile?.displayName)}</Text>
            </View>
            <View style={styles.heroBody}>
              <Text style={styles.name}>{profile?.displayName || "Player"}</Text>
              <Text style={styles.email}>{profile?.phoneNumber || "No mobile number"}</Text>
              <View style={styles.roleChip}>
                <Text style={styles.roleChipText}>
                  {profile?.role === "admin" ? "Admin" : "User"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Current Balance</Text>
            <CoinAmount
              value={(profile?.balance ?? 0).toLocaleString("en-IN")}
              size={32}
              weight="900"
              iconSize={22}
              style={styles.balanceValueRow}
            />
            <Text style={styles.balanceHint}>
              This updates when bets are placed, edited, or settled.
            </Text>
          </View>

          <View style={styles.statsGrid}>
            <StatCard label="Points" value={String(profile?.points ?? 0)} accent />
            <StatCard label="Wins" value={String(profile?.wins ?? 0)} />
            <StatCard label="Losses" value={String(profile?.losses ?? 0)} />
            <StatCard label="Predictions" value={String(profile?.totalPredictions ?? 0)} />
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.sectionTitle}>Account Details</Text>
            <DetailRow label="Phone" value={profile?.phoneNumber || "Not added"} />
            <DetailRow
              label="Win Rate"
              value={formatWinRate(profile?.wins ?? 0, profile?.losses ?? 0)}
            />
            <DetailRow
              label="Status"
              value={profile?.role === "admin" ? "Admin access enabled" : "Standard player"}
            />
          </View>

          <Pressable style={styles.logoutButton} onPress={() => router.push(logoutRoute)}>
            <Text style={styles.logoutButtonText}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
      <AppMenuSheet visible={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <Modal
        visible={isEditNameOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEditNameOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsEditNameOpen(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTextWrap}>
                <Text style={styles.modalTitle}>Update Name</Text>
                <Text style={styles.modalSubtitle}>Change how your name appears in the app.</Text>
              </View>
              <Pressable style={styles.modalCloseButton} onPress={() => setIsEditNameOpen(false)}>
                <CloseIcon />
              </Pressable>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Enter your display name"
              placeholderTextColor="#5F6B82"
              value={displayNameDraft}
              onChangeText={setDisplayNameDraft}
              maxLength={40}
              editable={!isSavingName}
              autoFocus
            />

            {nameMessage ? (
              <View
                style={[
                  styles.messageCard,
                  nameMessage.tone === "error"
                    ? styles.messageCardError
                    : styles.messageCardSuccess,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    nameMessage.tone === "error"
                      ? styles.messageTextError
                      : styles.messageTextSuccess,
                  ]}
                >
                  {nameMessage.text}
                </Text>
              </View>
            ) : null}

            <Pressable
              style={[styles.primaryButton, isSavingName && styles.buttonDisabled]}
              onPress={() => void handleSaveDisplayName()}
              disabled={isSavingName}
            >
              {isSavingName ? (
                <ActivityIndicator size="small" color="#F7FAFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Update</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent]}>
      <Text style={[styles.statLabel, accent && styles.statLabelAccent]}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function getInitials(name?: string | null) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (!parts.length) {
    return "P";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatWinRate(wins: number, losses: number) {
  const total = wins + losses;

  if (!total) {
    return "No settled matches yet";
  }

  return `${Math.round((wins / total) * 100)}%`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#091327",
  },
  content: {
    padding: 18,
    paddingTop: 36,
    paddingBottom: 40,
    gap: 18,
  },
  contentDesktop: {
    paddingTop: 28,
  },
  pageShell: {
    width: "100%",
    alignSelf: "center",
    gap: 18,
  },
  pageShellDesktop: {
    maxWidth: 960,
    gap: 24,
  },
  header: {
    gap: 8,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  headerTopRowDesktop: {
    width: "100%",
    maxWidth: 720,
  },
  headerTextWrap: {
    flex: 1,
    gap: 8,
  },
  headerDesktop: {
    alignItems: "center",
  },
  headerTextDesktop: {
    textAlign: "center",
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
    fontSize: 32,
    fontWeight: "800",
  },
  subtitle: {
    color: "#8EA0C1",
    fontSize: 16,
    lineHeight: 24,
  },
  errorCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#7A2A2A",
    backgroundColor: "#311515",
    padding: 16,
    gap: 8,
  },
  errorTitle: {
    color: "#FFD7D7",
    fontSize: 16,
    fontWeight: "700",
  },
  errorText: {
    color: "#F0B3B3",
    fontSize: 14,
    lineHeight: 20,
  },
  heroCard: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 20,
  },
  editTrigger: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 1,
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2E4F8E",
    backgroundColor: "#132952",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: "#1E5AE0",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#F7FAFF",
    fontSize: 28,
    fontWeight: "800",
  },
  heroBody: {
    flex: 1,
    gap: 6,
  },
  name: {
    color: "#F7FAFF",
    fontSize: 24,
    fontWeight: "800",
  },
  email: {
    color: "#9FB0CF",
    fontSize: 15,
  },
  roleChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#16356D",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  roleChipText: {
    color: "#DCE8FF",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  balanceCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#355AA8",
    backgroundColor: "#102042",
    padding: 22,
    gap: 8,
  },
  balanceLabel: {
    color: "#9FB0CF",
    fontSize: 15,
    fontWeight: "700",
  },
  balanceValue: {
    color: "#F7FAFF",
    fontSize: 32,
    fontWeight: "900",
  },
  balanceValueRow: {
    minHeight: 40,
  },
  balanceHint: {
    color: "#8EA0C1",
    fontSize: 14,
    lineHeight: 20,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  statCard: {
    width: "48%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 18,
    gap: 8,
  },
  statCardAccent: {
    borderColor: "#355AA8",
  },
  statLabel: {
    color: "#9FB0CF",
    fontSize: 14,
    fontWeight: "700",
  },
  statLabelAccent: {
    color: "#7FAAFF",
  },
  statValue: {
    color: "#F7FAFF",
    fontSize: 24,
    fontWeight: "800",
  },
  infoCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 20,
    gap: 14,
  },
  sectionTitle: {
    color: "#F7FAFF",
    fontSize: 20,
    fontWeight: "700",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    borderRadius: 16,
    backgroundColor: "#0E1B36",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  detailLabel: {
    color: "#8EA0C1",
    fontSize: 15,
    fontWeight: "600",
  },
  detailValue: {
    flex: 1,
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "right",
  },
  input: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#0E1B36",
    paddingHorizontal: 16,
    color: "#F7FAFF",
    fontSize: 16,
    fontWeight: "600",
  },
  messageCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  messageCardError: {
    borderColor: "#7A2A2A",
    backgroundColor: "#311515",
  },
  messageCardSuccess: {
    borderColor: "#1D6A48",
    backgroundColor: "#103222",
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  messageTextError: {
    color: "#F0B3B3",
  },
  messageTextSuccess: {
    color: "#B8F0D1",
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E5AE0",
  },
  primaryButtonText: {
    color: "#F7FAFF",
    fontSize: 16,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(3, 10, 20, 0.62)",
    paddingHorizontal: 20,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 20,
    gap: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  modalHeaderTextWrap: {
    flex: 1,
    gap: 4,
  },
  modalTitle: {
    color: "#F7FAFF",
    fontSize: 20,
    fontWeight: "800",
  },
  modalSubtitle: {
    color: "#8EA0C1",
    fontSize: 14,
    lineHeight: 20,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#0E1B36",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutButton: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E5AE0",
  },
  logoutButtonText: {
    color: "#F7FAFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
