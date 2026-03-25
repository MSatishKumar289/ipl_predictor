import { createElement, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { BackIcon } from "@/components/BackIcon";
import {
  createMatch,
  formatMatchDate,
  settleMatchOutcome,
  subscribeToMatches,
  updateMatchSettings,
} from "@/lib/matches";
import { getIplTeamById, IPL_TEAMS, type IplTeam, type IplTeamId } from "@/lib/ipl-teams";
import type { MatchRecord } from "@/lib/match-types";
import { useAuth } from "@/providers/AuthProvider";

type PendingSettlement = {
  matchId: string;
  winner: "teamA" | "teamB" | "no_result";
  matchLabel: string;
  outcomeLabel: string;
} | null;

type PickerMode = "date" | "time" | null;
type AdminMatchView = "live" | "results";

export default function AdminScreen() {
  const router = useRouter();
  const { user, profile, isLoading: isAuthLoading } = useAuth();
  const { width } = useWindowDimensions();
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [matchNumber, setMatchNumber] = useState("");
  const [teamAId, setTeamAId] = useState<IplTeamId | null>(null);
  const [teamBId, setTeamBId] = useState<IplTeamId | null>(null);
  const [matchDate, setMatchDate] = useState("");
  const [matchTime, setMatchTime] = useState("");
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [pickerValue, setPickerValue] = useState(new Date());
  const [isEditableBeforeLock, setIsEditableBeforeLock] = useState(true);
  const [pendingSettlement, setPendingSettlement] = useState<PendingSettlement>(null);
  const [isSettling, setIsSettling] = useState(false);
  const [activeMatchView, setActiveMatchView] = useState<AdminMatchView>("live");
  const [createMatchError, setCreateMatchError] = useState<string | null>(null);
  const [createMatchSuccess, setCreateMatchSuccess] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToMatches((nextMatches) => {
      setMatches(nextMatches);
      setIsLoadingMatches(false);
    });

    return unsubscribe;
  }, []);

  const liveMatches = useMemo(() => {
    return [...matches].filter((match) => match.status === "locked").reverse();
  }, [matches]);
  const resultMatches = useMemo(() => {
    return [...matches]
      .filter(
        (match) =>
          match.status === "settled" ||
          match.status === "no_result" ||
          match.status === "completed"
      )
      .reverse();
  }, [matches]);
  const visibleMatches = activeMatchView === "live" ? liveMatches : resultMatches;
  const selectedTeamA = useMemo(() => getIplTeamById(teamAId), [teamAId]);
  const selectedTeamB = useMemo(() => getIplTeamById(teamBId), [teamBId]);
  const isDesktop = width >= 1024;

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
    setCreateMatchError(null);
    setCreateMatchSuccess(null);

    if (
      !matchNumber.trim() ||
      !selectedTeamA ||
      !selectedTeamB ||
      !matchDate.trim() ||
      !matchTime.trim()
    ) {
      const message = "Fill in all match fields before creating the fixture.";
      setCreateMatchError(message);
      Alert.alert("Missing details", message);
      return;
    }

    if (selectedTeamA.id === selectedTeamB.id) {
      const message = "Team A and Team B must be different teams.";
      setCreateMatchError(message);
      Alert.alert("Choose two teams", message);
      return;
    }

    const startAt = new Date(`${matchDate}T${matchTime}:00+05:30`);
    if (Number.isNaN(startAt.getTime())) {
      const message = "Use YYYY-MM-DD for date and HH:MM in 24-hour format.";
      setCreateMatchError(message);
      Alert.alert("Invalid date", message);
      return;
    }

    setIsSubmitting(true);

    try {
      await createMatch(
        {
          matchNumber: Number(matchNumber),
          teamAName: selectedTeamA.name,
          teamBName: selectedTeamB.name,
          teamAShort: selectedTeamA.shortCode,
          teamBShort: selectedTeamB.shortCode,
          startAt: startAt.toISOString(),
          isEditableBeforeLock,
        },
        adminUserId
      );

      setMatchNumber("");
      setTeamAId(null);
      setTeamBId(null);
      setMatchDate("");
      setMatchTime("");
      setIsEditableBeforeLock(true);
      setCreateMatchSuccess("Match created successfully. The fixture is now live.");
      Alert.alert("Match created", "The fixture is now live in the matches list.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create match.";
      setCreateMatchError(message);
      Alert.alert("Create failed", message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSetOutcome(match: MatchRecord, winner: "teamA" | "teamB" | "no_result") {
    setPendingSettlement({
      matchId: match.id,
      winner,
      matchLabel: `${match.teamAShort} vs ${match.teamBShort}`,
      outcomeLabel:
        winner === "no_result"
          ? "No Result"
          : winner === "teamA"
            ? match.teamAShort
            : match.teamBShort,
    });
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

  async function confirmSettlement() {
    if (!pendingSettlement || isSettling) {
      return;
    }

    try {
      setIsSettling(true);
      await settleMatchOutcome(pendingSettlement.matchId, pendingSettlement.winner, adminUserId);
      setPendingSettlement(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to settle the match result.";
      Alert.alert("Settlement failed", message);
    } finally {
      setIsSettling(false);
    }
  }

  function openPicker(mode: Exclude<PickerMode, null>) {
    const seed = buildPickerSeed(matchDate, matchTime);
    setPickerValue(seed);
    setPickerMode(mode);
  }

  function handlePickerChange(nextValue?: Date) {
    if (!nextValue) {
      setPickerMode(null);
      return;
    }

    if (pickerMode === "date") {
      setMatchDate(formatDateValue(nextValue));
    }

    if (pickerMode === "time") {
      setMatchTime(formatTimeValue(nextValue));
    }

    setPickerValue(nextValue);
    setPickerMode(null);
  }

  const NativeDateTimePicker =
    Platform.OS === "web"
      ? null
      : (require("@react-native-community/datetimepicker").default as any);
  const settlementDialog = pendingSettlement ? (
    <View style={styles.modalOverlay}>
      <Pressable style={styles.modalBackdrop} onPress={() => setPendingSettlement(null)} />
      <View style={styles.confirmCard}>
        <Text style={styles.confirmTitle}>Confirm Match Result</Text>
        <Text style={styles.confirmText}>
          Set result for {pendingSettlement.matchLabel} as {pendingSettlement.outcomeLabel}?
        </Text>
        <Text style={styles.confirmHint}>
          This will run settlement for all predictions on that match.
        </Text>

        <Pressable
          style={[styles.confirmPrimaryButton, isSettling && styles.buttonDisabled]}
          onPress={confirmSettlement}
          disabled={isSettling}
        >
          {isSettling ? (
            <ActivityIndicator size="small" color="#F7FAFF" />
          ) : (
            <Text style={styles.confirmPrimaryButtonText}>Confirm Settlement</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.confirmSecondaryButton, isSettling && styles.buttonDisabled]}
          onPress={() => setPendingSettlement(null)}
          disabled={isSettling}
        >
          <Text style={styles.confirmSecondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.pageShell, isDesktop && styles.pageShellDesktop]}>
            <View style={styles.headerRow}>
              <Pressable
                style={styles.backButton}
                onPress={() => {
                  if (router.canGoBack()) {
                    router.back();
                    return;
                  }

                  router.replace("/(tabs)/profile");
                }}
              >
                <BackIcon />
              </Pressable>
              <View style={styles.headerTextWrap}>
                <Text style={[styles.title, isDesktop && styles.titleDesktop]}>Admin</Text>
                <Text style={[styles.subtitle, isDesktop && styles.subtitleDesktop]}>
                  Create fixtures and update the final result.
                </Text>
              </View>
            </View>

            <View style={[styles.card, isDesktop && styles.cardDesktop]}>
              <Text style={styles.cardTitle}>Create Match</Text>
              <TextInput
                style={styles.input}
                placeholder="Match number"
                placeholderTextColor="#4C5D7C"
                keyboardType="number-pad"
                value={matchNumber}
                onChangeText={(value) => setMatchNumber(value.replace(/[^0-9]/g, ""))}
              />
              <View style={styles.selectorSection}>
                <Text style={styles.selectorLabel}>Team A</Text>
                <View style={styles.teamGrid}>
                  {IPL_TEAMS.map((team) => (
                    <TeamOptionCard
                      key={`team-a-${team.id}`}
                      team={team}
                      isSelected={teamAId === team.id}
                      isDisabled={teamBId === team.id}
                      onPress={() => setTeamAId(team.id)}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.selectorSection}>
                <Text style={styles.selectorLabel}>Team B</Text>
                <View style={styles.teamGrid}>
                  {IPL_TEAMS.map((team) => (
                    <TeamOptionCard
                      key={`team-b-${team.id}`}
                      team={team}
                      isSelected={teamBId === team.id}
                      isDisabled={teamAId === team.id}
                      onPress={() => setTeamBId(team.id)}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.selectionSummaryCard}>
                <Text style={styles.selectionSummaryTitle}>Selected Teams</Text>
                <Text style={styles.selectionSummaryText}>
                  {selectedTeamA ? `${selectedTeamA.name} (${selectedTeamA.shortCode})` : "Choose Team A"}
                </Text>
                <Text style={styles.selectionSummaryText}>
                  {selectedTeamB ? `${selectedTeamB.name} (${selectedTeamB.shortCode})` : "Choose Team B"}
                </Text>
              </View>

              {createMatchError ? (
                <View style={styles.formMessageError}>
                  <Text style={styles.formMessageErrorText}>{createMatchError}</Text>
                </View>
              ) : null}

              {createMatchSuccess ? (
                <View style={styles.formMessageSuccess}>
                  <Text style={styles.formMessageSuccessText}>{createMatchSuccess}</Text>
                </View>
              ) : null}
              {Platform.OS === "web" ? (
                <>
                  <WebDateTimeInput
                    type="date"
                    value={matchDate}
                    onChange={setMatchDate}
                    placeholder="Match date"
                  />
                  <WebDateTimeInput
                    type="time"
                    value={matchTime}
                    onChange={setMatchTime}
                    placeholder="Match time"
                  />
                </>
              ) : (
                <>
                  <Pressable style={styles.inputButton} onPress={() => openPicker("date")}>
                    <Text style={[styles.inputButtonText, !matchDate && styles.placeholderText]}>
                      {matchDate || "Select match date"}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.inputButton} onPress={() => openPicker("time")}>
                    <Text style={[styles.inputButtonText, !matchTime && styles.placeholderText]}>
                      {matchTime || "Select match time"}
                    </Text>
                  </Pressable>
                </>
              )}

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

          <View style={[styles.card, isDesktop && styles.cardDesktop]}>
            <Text style={styles.cardTitle}>Manage Matches</Text>
            <View style={styles.viewTabs}>
              <Pressable
                style={[styles.viewTab, activeMatchView === "live" && styles.viewTabActive]}
                onPress={() => setActiveMatchView("live")}
              >
                <Text
                  style={[
                    styles.viewTabText,
                    activeMatchView === "live" && styles.viewTabTextActive,
                  ]}
                >
                  Live
                </Text>
              </Pressable>
              <Pressable
                style={[styles.viewTab, activeMatchView === "results" && styles.viewTabActive]}
                onPress={() => setActiveMatchView("results")}
              >
                <Text
                  style={[
                    styles.viewTabText,
                    activeMatchView === "results" && styles.viewTabTextActive,
                  ]}
                >
                  Results
                </Text>
              </Pressable>
            </View>
            {isLoadingMatches ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="small" color="#1E5AE0" />
              </View>
            ) : visibleMatches.length ? (
              visibleMatches.map((match) => (
                <View key={match.id} style={styles.matchRow}>
                  {(() => {
                    const settlementLocked =
                      match.status === "settled" ||
                      match.status === "no_result" ||
                      match.status === "completed";

                    return (
                      <>
                  <View style={styles.matchSummary}>
                    <Text style={styles.matchName}>
                      Match {match.matchNumber}: {match.teamAShort} vs {match.teamBShort}
                    </Text>
                    <Text style={styles.matchMeta}>
                      {formatMatchDate(match.startAt)} | Winner:{" "}
                      {formatWinner(match)}
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
                      style={[
                        styles.actionButton,
                        settlementLocked && styles.actionButtonDisabled,
                      ]}
                      onPress={() => handleSetOutcome(match, "teamA")}
                      disabled={settlementLocked}
                    >
                      <Text style={styles.actionButtonText}>{match.teamAShort}</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.actionButton,
                        settlementLocked && styles.actionButtonDisabled,
                      ]}
                      onPress={() => handleSetOutcome(match, "teamB")}
                      disabled={settlementLocked}
                    >
                      <Text style={styles.actionButtonText}>{match.teamBShort}</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.actionButtonAlt,
                        settlementLocked && styles.actionButtonDisabled,
                      ]}
                      onPress={() => handleSetOutcome(match, "no_result")}
                      disabled={settlementLocked}
                    >
                      <Text style={styles.actionButtonText}>No Result</Text>
                    </Pressable>
                  </View>

                  {settlementLocked ? (
                    <Text style={styles.lockedActionsText}>
                      Result already recorded. Settlement actions are disabled.
                    </Text>
                  ) : null}
                      </>
                    );
                  })()}
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>
                {activeMatchView === "live"
                  ? "No live matches right now."
                  : "No settled results recorded yet."}
              </Text>
            )}
          </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {Platform.OS === "web" ? (
        settlementDialog
      ) : (
        <Modal
          visible={!!pendingSettlement}
          transparent
          animationType="fade"
          onRequestClose={() => setPendingSettlement(null)}
        >
          {settlementDialog}
        </Modal>
      )}

      {NativeDateTimePicker && pickerMode ? (
        <NativeDateTimePicker
          value={pickerValue}
          mode={pickerMode}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          is24Hour
          onChange={(event: { type?: string }, date?: Date) => {
            if (event.type === "dismissed") {
              setPickerMode(null);
              return;
            }

            handlePickerChange(date);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function buildPickerSeed(dateValue: string, timeValue: string) {
  if (dateValue && timeValue) {
    const combined = new Date(`${dateValue}T${timeValue}:00+05:30`);
    if (!Number.isNaN(combined.getTime())) {
      return combined;
    }
  }

  if (dateValue) {
    const dateOnly = new Date(`${dateValue}T12:00:00+05:30`);
    if (!Number.isNaN(dateOnly.getTime())) {
      return dateOnly;
    }
  }

  return new Date();
}

function formatDateValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeValue(value: Date) {
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function WebDateTimeInput({
  type,
  value,
  onChange,
  placeholder,
}: {
  type: "date" | "time";
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  if (Platform.OS !== "web") {
    return null;
  }

  return createElement("input", {
    type,
    value,
    placeholder,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
    style: {
      width: "100%",
      height: 56,
      borderRadius: 16,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "#334C76",
      backgroundColor: "#162645",
      paddingLeft: 16,
      paddingRight: 16,
      color: "#F7FAFF",
      fontSize: 16,
      outline: "none",
      boxSizing: "border-box",
    },
  });
}

function formatWinner(match: MatchRecord) {
  if (match.winner === "teamA") {
    return match.teamAShort;
  }

  if (match.winner === "teamB") {
    return match.teamBShort;
  }

  if (match.winner === "no_result") {
    return "No Result";
  }

  return "Yet to start";
}

function TeamOptionCard({
  team,
  isSelected,
  isDisabled,
  onPress,
}: {
  team: IplTeam;
  isSelected: boolean;
  isDisabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.teamOption,
        styles.teamOptionCompact,
        isSelected && styles.teamOptionSelected,
        isDisabled && styles.teamOptionDisabled,
      ]}
      onPress={onPress}
      disabled={isDisabled}
    >
      <Text style={[styles.teamCode, styles.teamCodeCompact, isSelected && styles.teamCodeSelected]}>
        {team.shortCode}
      </Text>
    </Pressable>
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
  contentDesktop: {
    paddingTop: 28,
    paddingBottom: 40,
  },
  pageShell: {
    width: "100%",
    alignSelf: "center",
    gap: 22,
  },
  pageShellDesktop: {
    maxWidth: 1040,
    gap: 24,
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
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#102042",
    borderWidth: 1,
    borderColor: "#223A63",
    marginTop: 2,
  },
  title: {
    color: "#F5F7FB",
    fontSize: 30,
    fontWeight: "800",
  },
  titleDesktop: {
    fontSize: 26,
  },
  subtitle: {
    color: "#93A1BC",
    fontSize: 16,
    lineHeight: 24,
  },
  subtitleDesktop: {
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 20,
    gap: 14,
  },
  cardDesktop: {
    padding: 18,
  },
  cardTitle: {
    color: "#F7FAFF",
    fontSize: 22,
    fontWeight: "700",
  },
  viewTabs: {
    flexDirection: "row",
    gap: 10,
  },
  viewTab: {
    minWidth: 92,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#0E1B36",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  viewTabActive: {
    borderColor: "#1E5AE0",
    backgroundColor: "#16356D",
  },
  viewTabText: {
    color: "#9FB0CF",
    fontSize: 14,
    fontWeight: "700",
  },
  viewTabTextActive: {
    color: "#F7FAFF",
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
  selectorSection: {
    gap: 10,
  },
  selectorLabel: {
    color: "#F7FAFF",
    fontSize: 16,
    fontWeight: "700",
  },
  teamGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  teamOption: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334C76",
    backgroundColor: "#162645",
    alignItems: "center",
    justifyContent: "center",
  },
  teamOptionCompact: {
    width: "48%",
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  teamOptionSelected: {
    borderColor: "#1E5AE0",
    backgroundColor: "#18315E",
  },
  teamOptionDisabled: {
    opacity: 0.4,
  },
  teamCode: {
    color: "#DDE5F7",
    fontSize: 15,
    fontWeight: "800",
  },
  teamCodeCompact: {
    fontSize: 18,
  },
  teamCodeSelected: {
    color: "#F7FAFF",
  },
  selectionSummaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#0E1B36",
    padding: 16,
    gap: 6,
  },
  selectionSummaryTitle: {
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "700",
  },
  selectionSummaryText: {
    color: "#9FB0CF",
    fontSize: 14,
    lineHeight: 20,
  },
  formMessageError: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#7A2A2A",
    backgroundColor: "#311515",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  formMessageErrorText: {
    color: "#F0B3B3",
    fontSize: 14,
    lineHeight: 20,
  },
  formMessageSuccess: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2B7B57",
    backgroundColor: "#123325",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  formMessageSuccessText: {
    color: "#BEEFD5",
    fontSize: 14,
    lineHeight: 20,
  },
  inputButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334C76",
    backgroundColor: "#162645",
    paddingHorizontal: 16,
    height: 56,
    justifyContent: "center",
  },
  inputButtonText: {
    color: "#F7FAFF",
    fontSize: 16,
  },
  placeholderText: {
    color: "#4C5D7C",
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
  actionButtonDisabled: {
    opacity: 0.45,
  },
  lockedActionsText: {
    color: "#F9B17A",
    fontSize: 13,
    lineHeight: 20,
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
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(3, 10, 20, 0.62)",
    zIndex: 20,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  confirmCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 22,
    gap: 14,
  },
  confirmTitle: {
    color: "#F7FAFF",
    fontSize: 22,
    fontWeight: "800",
  },
  confirmText: {
    color: "#DDE5F7",
    fontSize: 16,
    lineHeight: 24,
  },
  confirmHint: {
    color: "#93A1BC",
    fontSize: 14,
    lineHeight: 20,
  },
  confirmPrimaryButton: {
    marginTop: 6,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E5AE0",
  },
  confirmPrimaryButtonText: {
    color: "#F7FAFF",
    fontSize: 16,
    fontWeight: "800",
  },
  confirmSecondaryButton: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1B2740",
  },
  confirmSecondaryButtonText: {
    color: "#DDE5F7",
    fontSize: 16,
    fontWeight: "700",
  },
});
