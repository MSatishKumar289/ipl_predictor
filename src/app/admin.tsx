import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  createMatch,
  formatMatchDate,
  settleMatchOutcome,
  subscribeToMatches,
  updateMatchSettings,
} from "@/lib/matches";
import type { MatchRecord } from "@/lib/match-types";
import { useAuth } from "@/providers/AuthProvider";

export default function AdminScreen() {
  const router = useRouter();
  const { user, profile, isLoading: isAuthLoading } = useAuth();
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [matchNumber, setMatchNumber] = useState("");
  const [teamAName, setTeamAName] = useState("");
  const [teamBName, setTeamBName] = useState("");
  const [teamAShort, setTeamAShort] = useState("");
  const [teamBShort, setTeamBShort] = useState("");
  const [matchDate, setMatchDate] = useState("");
  const [matchTime, setMatchTime] = useState("");
  const [isEditableBeforeLock, setIsEditableBeforeLock] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToMatches((nextMatches) => {
      setMatches(nextMatches);
      setIsLoadingMatches(false);
    });

    return unsubscribe;
  }, []);

  const recentMatches = useMemo(() => [...matches].reverse(), [matches]);

  if (isAuthLoading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#1E5AE0" />
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return null;
  }

  if (profile?.role !== "admin") {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.blockedCard}>
          <Text style={styles.blockedTitle}>Admin only</Text>
          <Text style={styles.blockedText}>
            Your account is not marked as admin yet. Update your Firestore user document
            and try again.
          </Text>
          <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
            <Text style={styles.secondaryButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const adminUserId = user.uid;

  async function handleCreateMatch() {
    if (
      !matchNumber.trim() ||
      !teamAName.trim() ||
      !teamBName.trim() ||
      !teamAShort.trim() ||
      !teamBShort.trim() ||
      !matchDate.trim() ||
      !matchTime.trim()
    ) {
      Alert.alert("Missing details", "Fill in all match fields before creating the fixture.");
      return;
    }

    const startAt = new Date(`${matchDate}T${matchTime}:00+05:30`);
    if (Number.isNaN(startAt.getTime())) {
      Alert.alert("Invalid date", "Use YYYY-MM-DD for date and HH:MM in 24-hour format.");
      return;
    }

    setIsSubmitting(true);

    try {
      await createMatch(
        {
          matchNumber: Number(matchNumber),
          teamAName,
          teamBName,
          teamAShort,
          teamBShort,
          startAt: startAt.toISOString(),
          isEditableBeforeLock,
        },
        adminUserId
      );

      setMatchNumber("");
      setTeamAName("");
      setTeamBName("");
      setTeamAShort("");
      setTeamBShort("");
      setMatchDate("");
      setMatchTime("");
      setIsEditableBeforeLock(true);
      Alert.alert("Match created", "The fixture is now live in the matches list.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create match.";
      Alert.alert("Create failed", message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSetOutcome(matchId: string, winner: "teamA" | "teamB" | "no_result") {
    const label =
      winner === "no_result" ? "no result" : winner === "teamA" ? "Team A win" : "Team B win";

    Alert.alert("Confirm and settle", `Set this match outcome as ${label} and settle now?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        onPress: async () => {
          try {
            await settleMatchOutcome(matchId, winner, adminUserId);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unable to settle the match result.";
            Alert.alert("Settlement failed", message);
          }
        },
      },
    ]);
  }

  async function handleToggleEditing(matchId: string, nextValue: boolean) {
    try {
      await updateMatchSettings(matchId, nextValue);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update editing settings.";
      Alert.alert("Update failed", message);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Admin</Text>
          <Text style={styles.subtitle}>Create fixtures and update the final result.</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Create Match</Text>
            <TextInput
              style={styles.input}
              placeholder="Match number"
              placeholderTextColor="#4C5D7C"
              keyboardType="number-pad"
              value={matchNumber}
              onChangeText={(value) => setMatchNumber(value.replace(/[^0-9]/g, ""))}
            />
            <TextInput
              style={styles.input}
              placeholder="Team A name"
              placeholderTextColor="#4C5D7C"
              value={teamAName}
              onChangeText={setTeamAName}
            />
            <TextInput
              style={styles.input}
              placeholder="Team A short code"
              placeholderTextColor="#4C5D7C"
              value={teamAShort}
              onChangeText={setTeamAShort}
            />
            <TextInput
              style={styles.input}
              placeholder="Team B name"
              placeholderTextColor="#4C5D7C"
              value={teamBName}
              onChangeText={setTeamBName}
            />
            <TextInput
              style={styles.input}
              placeholder="Team B short code"
              placeholderTextColor="#4C5D7C"
              value={teamBShort}
              onChangeText={setTeamBShort}
            />
            <TextInput
              style={styles.input}
              placeholder="Match date (YYYY-MM-DD)"
              placeholderTextColor="#4C5D7C"
              value={matchDate}
              onChangeText={setMatchDate}
            />
            <TextInput
              style={styles.input}
              placeholder="Match time (HH:MM, 24h)"
              placeholderTextColor="#4C5D7C"
              value={matchTime}
              onChangeText={setMatchTime}
            />

            <View style={styles.toggleRow}>
              <View style={styles.toggleTextWrap}>
                <Text style={styles.toggleTitle}>Editable before lock</Text>
                <Text style={styles.toggleSubtitle}>
                  Switch this off if you want to freeze prediction edits manually.
                </Text>
              </View>
              <Switch
                value={isEditableBeforeLock}
                onValueChange={setIsEditableBeforeLock}
                trackColor={{ false: "#334C76", true: "#1E5AE0" }}
                thumbColor="#F7FAFF"
              />
            </View>

            <Pressable
              style={[styles.primaryButton, isSubmitting && styles.buttonDisabled]}
              onPress={handleCreateMatch}
              disabled={isSubmitting}
            >
              <Text style={styles.primaryButtonText}>
                {isSubmitting ? "Creating..." : "Create Match"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Manage Live Matches</Text>
            {isLoadingMatches ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="small" color="#1E5AE0" />
              </View>
            ) : recentMatches.length ? (
              recentMatches.map((match) => (
                <View key={match.id} style={styles.matchRow}>
                  <View style={styles.matchSummary}>
                    <Text style={styles.matchName}>
                      Match {match.matchNumber}: {match.teamAShort} vs {match.teamBShort}
                    </Text>
                    <Text style={styles.matchMeta}>
                      {formatMatchDate(match.startAt)} | Current:{" "}
                      {match.winner ? match.winner.replace("_", " ") : "pending"}
                    </Text>
                  </View>

                  <View style={styles.toggleRow}>
                    <View style={styles.toggleTextWrap}>
                      <Text style={styles.toggleTitle}>Allow edits before lock</Text>
                      <Text style={styles.toggleSubtitle}>
                        Current status: {match.status.replace("_", " ")}
                      </Text>
                    </View>
                    <Switch
                      value={match.isEditableBeforeLock}
                      onValueChange={(value) => handleToggleEditing(match.id, value)}
                      trackColor={{ false: "#334C76", true: "#1E5AE0" }}
                      thumbColor="#F7FAFF"
                    />
                  </View>

                  <View style={styles.actionRow}>
                    <Pressable
                      style={styles.actionButton}
                      onPress={() => handleSetOutcome(match.id, "teamA")}
                    >
                      <Text style={styles.actionButtonText}>{match.teamAShort}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionButton}
                      onPress={() => handleSetOutcome(match.id, "teamB")}
                    >
                      <Text style={styles.actionButtonText}>{match.teamBShort}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionButtonAlt}
                      onPress={() => handleSetOutcome(match.id, "no_result")}
                    >
                      <Text style={styles.actionButtonText}>No Result</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No fixtures yet. Create your first match above.</Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#07152E",
  },
  keyboardWrap: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 48,
    gap: 22,
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64,
  },
  title: {
    color: "#F5F7FB",
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: "#93A1BC",
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 20,
    gap: 14,
  },
  cardTitle: {
    color: "#F7FAFF",
    fontSize: 22,
    fontWeight: "700",
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334C76",
    backgroundColor: "#162645",
    paddingHorizontal: 16,
    height: 56,
    color: "#F7FAFF",
    fontSize: 16,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#0E1B36",
    padding: 16,
  },
  toggleTextWrap: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    color: "#F7FAFF",
    fontSize: 16,
    fontWeight: "700",
  },
  toggleSubtitle: {
    color: "#93A1BC",
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: "#1E5AE0",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#F7FAFF",
    fontSize: 17,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  matchRow: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#0E1B36",
    padding: 16,
    gap: 12,
  },
  matchSummary: {
    gap: 4,
  },
  matchName: {
    color: "#F7FAFF",
    fontSize: 17,
    fontWeight: "700",
  },
  matchMeta: {
    color: "#9FB0CF",
    fontSize: 14,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionButton: {
    minWidth: 88,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E5AE0",
    paddingHorizontal: 14,
  },
  actionButtonAlt: {
    minWidth: 110,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#374A6A",
    paddingHorizontal: 14,
  },
  actionButtonText: {
    color: "#F7FAFF",
    fontSize: 14,
    fontWeight: "700",
  },
  blockedCard: {
    margin: 24,
    marginTop: 80,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 24,
    gap: 12,
  },
  blockedTitle: {
    color: "#F7FAFF",
    fontSize: 24,
    fontWeight: "800",
  },
  blockedText: {
    color: "#9FB0CF",
    fontSize: 15,
    lineHeight: 22,
  },
  secondaryButton: {
    marginTop: 8,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E5AE0",
  },
  secondaryButtonText: {
    color: "#F7FAFF",
    fontSize: 16,
    fontWeight: "700",
  },
  emptyText: {
    color: "#9FB0CF",
    fontSize: 15,
    lineHeight: 22,
  },
});
