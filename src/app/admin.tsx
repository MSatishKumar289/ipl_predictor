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
import { CloseIcon } from "@/components/CloseIcon";
import {
  createMatch,
  formatMatchDate,
  settleMatchOutcome,
  subscribeToMatches,
  updateMatchSettings,
} from "@/lib/matches";
import {
  subscribeToAccessControlSettings,
  updateAccessControlSettings,
} from "@/lib/access-control";
import { approveUserAccess, deleteUserRecords, subscribeToAllUsers } from "@/lib/auth";
import { getIplTeamById, IPL_TEAMS, type IplTeam, type IplTeamId } from "@/lib/ipl-teams";
import type { MatchRecord } from "@/lib/match-types";
import type { UserAccessStatus, UserProfileRecord } from "@/lib/auth-types";
import { useAuth } from "@/providers/AuthProvider";

type PendingSettlement = {
  matchId: string;
  winner: "teamA" | "teamB" | "no_result";
  matchLabel: string;
  outcomeLabel: string;
} | null;

type PickerMode = "date" | "time" | null;
type AdminMatchView = "live" | "results";
type AdminSection = "matches" | "users";
type AdminUserView = "active" | "pending";

export default function AdminScreen() {
  const router = useRouter();
  const { user, profile, isLoading: isAuthLoading } = useAuth();
  const { width } = useWindowDimensions();
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [users, setUsers] = useState<UserProfileRecord[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
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
  const [activeSection, setActiveSection] = useState<AdminSection>("users");
  const [activeMatchView, setActiveMatchView] = useState<AdminMatchView>("live");
  const [activeUserView, setActiveUserView] = useState<AdminUserView>("active");
  const [pendingApprovalUserId, setPendingApprovalUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfileRecord | null>(null);
  const [requireReferralForInstantAccess, setRequireReferralForInstantAccess] = useState(true);
  const [isUpdatingAccessControl, setIsUpdatingAccessControl] = useState(false);
  const [createMatchError, setCreateMatchError] = useState<string | null>(null);
  const [createMatchSuccess, setCreateMatchSuccess] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToMatches((nextMatches) => {
      setMatches(nextMatches);
      setIsLoadingMatches(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAllUsers(
      (nextUsers) => {
        setUsers(nextUsers);
        setIsLoadingUsers(false);
      },
      () => {
        setUsers([]);
        setIsLoadingUsers(false);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAccessControlSettings(
      (settings) => {
        setRequireReferralForInstantAccess(settings.requireReferralForInstantAccess);
      },
      () => {
        setRequireReferralForInstantAccess(true);
      }
    );

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
  const activeUsers = useMemo(
    () => users.filter((entry) => getUserAccessStatus(entry) !== "pending_approval"),
    [users]
  );
  const pendingUsers = useMemo(
    () => users.filter((entry) => getUserAccessStatus(entry) === "pending_approval"),
    [users]
  );
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

  async function handleApproveUser(targetUserId: string) {
    if (pendingApprovalUserId) {
      return;
    }

    try {
      setPendingApprovalUserId(targetUserId);
      await approveUserAccess(targetUserId);
      setSelectedUser(null);
      Alert.alert("Access approved", "The user can now access the app.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to approve user access.";
      Alert.alert("Approval failed", message);
    } finally {
      setPendingApprovalUserId(null);
    }
  }

  async function handleDeleteUserRecords(targetUserId: string) {
    if (pendingApprovalUserId) {
      return;
    }

    try {
      setPendingApprovalUserId(targetUserId);
      await deleteUserRecords(targetUserId);
      setSelectedUser(null);
      Alert.alert("Records deleted", "The user's Firestore records have been removed.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete the user's records.";
      Alert.alert("Delete failed", message);
    } finally {
      setPendingApprovalUserId(null);
    }
  }

  async function handleToggleAccessControl(nextValue: boolean) {
    const previousValue = requireReferralForInstantAccess;

    try {
      setIsUpdatingAccessControl(true);
      setRequireReferralForInstantAccess(nextValue);
      await updateAccessControlSettings({
        requireReferralForInstantAccess: nextValue,
      });
    } catch (error) {
      setRequireReferralForInstantAccess(previousValue);
      const message =
        error instanceof Error ? error.message : "Unable to update access-control settings.";
      Alert.alert("Update failed", message);
    } finally {
      setIsUpdatingAccessControl(false);
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
  const selectedUserStatus = selectedUser ? getUserAccessStatus(selectedUser) : null;
  const userDialog = selectedUser ? (
    <View style={styles.modalOverlay}>
      <Pressable style={styles.modalBackdrop} onPress={() => setSelectedUser(null)} />
      <View style={styles.confirmCard}>
        <View style={styles.modalHeader}>
          <View style={styles.modalHeaderTextWrap}>
            <Text style={styles.confirmTitle}>
              {selectedUserStatus === "pending_approval" ? "Pending Request" : "User Details"}
            </Text>
            <Text style={styles.confirmText}>{selectedUser.displayName}</Text>
          </View>
          <Pressable style={styles.modalCloseButton} onPress={() => setSelectedUser(null)}>
            <CloseIcon />
          </Pressable>
        </View>
        <ScrollView
          style={styles.modalBodyScroll}
          contentContainerStyle={styles.modalBodyContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.detailGrid}>
            <DetailRow label="Phone" value={selectedUser.phoneNumber || "-"} />
            <DetailRow label="Email" value={selectedUser.email || "-"} />
            <DetailRow label="Role" value={selectedUser.role === "admin" ? "Admin" : "User"} />
            <DetailRow label="Status" value={formatUserAccessStatus(selectedUser)} />
            {selectedUserStatus !== "pending_approval" ? (
              <>
                <DetailRow
                  label="Coins"
                  value={selectedUser.balance.toLocaleString("en-IN")}
                />
                <DetailRow label="Points" value={selectedUser.points.toLocaleString("en-IN")} />
                <DetailRow label="Wins" value={String(selectedUser.wins)} />
                <DetailRow label="Losses" value={String(selectedUser.losses)} />
                <DetailRow
                  label="Total Predictions"
                  value={selectedUser.totalPredictions.toLocaleString("en-IN")}
                />
                <DetailRow
                  label="Login Method"
                  value={selectedUser.loginMethod === "phone" ? "Phone" : "Email"}
                />
                <DetailRow
                  label="Referred By"
                  value={selectedUser.referredByDisplayName || "-"}
                />
                <DetailRow label="Referral Id" value={selectedUser.referralId || "-"} />
              </>
            ) : null}
          </View>
          <Text style={styles.confirmHint}>
            This deletes app records only. Firebase Auth will remain until you remove it manually.
          </Text>

          {selectedUserStatus === "pending_approval" ? (
            <Pressable
              style={[styles.confirmPrimaryButton, pendingApprovalUserId && styles.buttonDisabled]}
              onPress={() => handleApproveUser(selectedUser.uid)}
              disabled={!!pendingApprovalUserId}
            >
              {pendingApprovalUserId === selectedUser.uid ? (
                <ActivityIndicator size="small" color="#F7FAFF" />
              ) : (
                <Text style={styles.confirmPrimaryButtonText}>Accept</Text>
              )}
            </Pressable>
          ) : null}
          {selectedUserStatus !== "pending_approval" ? (
            <Pressable
              style={[styles.confirmDangerButton, pendingApprovalUserId && styles.buttonDisabled]}
              onPress={() => handleDeleteUserRecords(selectedUser.uid)}
              disabled={!!pendingApprovalUserId}
            >
              {pendingApprovalUserId === selectedUser.uid ? (
                <ActivityIndicator size="small" color="#F7FAFF" />
              ) : (
                <Text style={styles.confirmPrimaryButtonText}>Delete User Records</Text>
              )}
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.confirmSecondaryButton, pendingApprovalUserId && styles.buttonDisabled]}
            onPress={() => setSelectedUser(null)}
            disabled={!!pendingApprovalUserId}
          >
            <Text style={styles.confirmSecondaryButtonText}>Cancel</Text>
          </Pressable>
        </ScrollView>
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
                  Manage fixtures and player access from one place.
                </Text>
              </View>
            </View>

            <View style={styles.sectionTabs}>
              <AdminTabButton
                label="Users List"
                active={activeSection === "users"}
                onPress={() => setActiveSection("users")}
              />
              <AdminTabButton
                label="Create Match"
                active={activeSection === "matches"}
                onPress={() => setActiveSection("matches")}
              />
            </View>

            {activeSection === "matches" ? (
              <>
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
                      {selectedTeamA
                        ? `${selectedTeamA.name} (${selectedTeamA.shortCode})`
                        : "Choose Team A"}
                    </Text>
                    <Text style={styles.selectionSummaryText}>
                      {selectedTeamB
                        ? `${selectedTeamB.name} (${selectedTeamB.shortCode})`
                        : "Choose Team B"}
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
                    <AdminTabButton
                      label="Live"
                      active={activeMatchView === "live"}
                      onPress={() => setActiveMatchView("live")}
                      compact
                    />
                    <AdminTabButton
                      label="Results"
                      active={activeMatchView === "results"}
                      onPress={() => setActiveMatchView("results")}
                      compact
                    />
                  </View>
                  {isLoadingMatches ? (
                    <View style={styles.loadingState}>
                      <ActivityIndicator size="small" color="#1E5AE0" />
                    </View>
                  ) : visibleMatches.length ? (
                    visibleMatches.map((match) => {
                      const settlementLocked =
                        match.status === "settled" ||
                        match.status === "no_result" ||
                        match.status === "completed";

                      return (
                        <View key={match.id} style={styles.matchRow}>
                          <View style={styles.matchSummary}>
                            <Text style={styles.matchName}>
                              Match {match.matchNumber}: {match.teamAShort} vs {match.teamBShort}
                            </Text>
                            <Text style={styles.matchMeta}>
                              {formatMatchDate(match.startAt)} | Winner: {formatWinner(match)}
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
                        </View>
                      );
                    })
                  ) : (
                    <Text style={styles.emptyText}>
                      {activeMatchView === "live"
                        ? "No live matches right now."
                        : "No settled results recorded yet."}
                    </Text>
                  )}
                </View>
              </>
            ) : (
              <View style={[styles.card, isDesktop && styles.cardDesktop]}>
                <Text style={styles.cardTitle}>Users List</Text>
                <View style={styles.adminSettingRow}>
                  <View style={styles.adminSettingLabelWrap}>
                    <Text style={styles.adminSettingTitle}>Require referral for instant access</Text>
                    <Text style={styles.adminSettingText}>
                      ON = non-referred users wait for approval. OFF = all new users get access
                      immediately.
                    </Text>
                  </View>
                  <Switch
                    value={requireReferralForInstantAccess}
                    onValueChange={handleToggleAccessControl}
                    disabled={isUpdatingAccessControl}
                    trackColor={{ false: "#334C76", true: "#1E5AE0" }}
                    thumbColor="#F7FAFF"
                  />
                </View>
                <View style={styles.viewTabs}>
                  <AdminTabButton
                    label="Approved"
                    active={activeUserView === "active"}
                    onPress={() => setActiveUserView("active")}
                    compact
                  />
                  <AdminTabButton
                    label="Pending"
                    active={activeUserView === "pending"}
                    onPress={() => setActiveUserView("pending")}
                    compact
                  />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.userTableScrollContent}
                >
                  <View style={styles.userTable}>
                    <View style={styles.userTableHeader}>
                      <View style={[styles.userCell, styles.userNameCell]}>
                        <Text style={styles.userTableHeaderText}>Name</Text>
                      </View>
                      <View style={[styles.userCell, styles.userPhoneCell]}>
                        <Text style={styles.userTableHeaderText}>Phone</Text>
                      </View>
                      <View style={[styles.userCell, styles.userStatusCell]}>
                        <Text style={styles.userTableHeaderText}>Status</Text>
                      </View>
                      <View style={[styles.userCell, styles.userRoleCell]}>
                        <Text style={styles.userTableHeaderText}>Role</Text>
                      </View>
                      <View style={[styles.userCell, styles.userActionCell]}>
                        <Text style={styles.userTableHeaderText}>
                          {activeUserView === "pending" ? "Action" : "Email"}
                        </Text>
                      </View>
                    </View>
                    {activeUserView === "active" ? (
                      isLoadingUsers ? (
                        <View style={styles.loadingState}>
                          <ActivityIndicator size="small" color="#1E5AE0" />
                        </View>
                      ) : activeUsers.length ? (
                        activeUsers.map((entry) => (
                          <UserRow key={entry.uid} user={entry} onRowPress={() => setSelectedUser(entry)} />
                        ))
                      ) : (
                        <Text style={styles.emptyText}>No users found yet.</Text>
                      )
                    ) : pendingUsers.length ? (
                      pendingUsers.map((entry) => (
                        <UserRow
                          key={entry.uid}
                          user={entry}
                          actionLabel="Review"
                          onRowPress={() => setSelectedUser(entry)}
                        />
                      ))
                    ) : (
                      <View style={styles.pendingStateCard}>
                        <Text style={styles.pendingStateTitle}>No approval requests yet</Text>
                        <Text style={styles.pendingStateText}>
                          Pending user requests will appear here once the approval flow is wired in.
                        </Text>
                      </View>
                    )}
                  </View>
                </ScrollView>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {Platform.OS === "web" ? (
        <>
          {settlementDialog}
          {userDialog}
        </>
      ) : (
        <>
          <Modal
            visible={!!pendingSettlement}
            transparent
            animationType="fade"
            onRequestClose={() => setPendingSettlement(null)}
          >
            {settlementDialog}
          </Modal>
          <Modal
            visible={!!selectedUser}
            transparent
            animationType="fade"
            onRequestClose={() => setSelectedUser(null)}
          >
            {userDialog}
          </Modal>
        </>
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

function AdminTabButton({
  label,
  active,
  onPress,
  compact = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.viewTab,
        compact ? styles.viewTabCompact : styles.viewTabWide,
        active && styles.viewTabActive,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.viewTabText, active && styles.viewTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function getUserAccessStatus(user: UserProfileRecord): UserAccessStatus {
  return user.accessStatus ?? "active";
}

function formatUserAccessStatus(user: UserProfileRecord) {
  return getUserAccessStatus(user) === "pending_approval" ? "Pending Approval" : "Active";
}

function UserRow({
  user,
  actionLabel,
  onRowPress,
}: {
  user: UserProfileRecord;
  actionLabel?: string;
  onRowPress?: () => void;
}) {
  const content = (
    <View style={styles.userTableRow}>
      <View style={[styles.userCell, styles.userNameCell]}>
        <Text style={styles.userTablePrimary}>{user.displayName}</Text>
      </View>
      <View style={[styles.userCell, styles.userPhoneCell]}>
        <Text style={styles.userTableText}>{user.phoneNumber || "-"}</Text>
      </View>
      <View style={[styles.userCell, styles.userStatusCell]}>
        <Text style={styles.userTableText}>{formatUserAccessStatus(user)}</Text>
      </View>
      <View style={[styles.userCell, styles.userRoleCell]}>
        <Text style={styles.userTableText}>{user.role === "admin" ? "Admin" : "User"}</Text>
      </View>
      <View style={[styles.userCell, styles.userActionCell]}>
        <Text style={styles.userTableMuted}>{actionLabel || user.email || "-"}</Text>
      </View>
    </View>
  );

  if (!onRowPress) {
    return content;
  }

  return (
    <Pressable onPress={onRowPress} style={styles.userRowPressable}>
      {content}
    </Pressable>
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
  sectionTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
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
    flexWrap: "wrap",
    gap: 10,
  },
  viewTab: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#0E1B36",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  viewTabWide: {
    minWidth: 132,
  },
  viewTabCompact: {
    minWidth: 92,
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
  adminSettingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#223A63",
    paddingBottom: 12,
  },
  adminSettingLabelWrap: {
    flex: 1,
    gap: 4,
  },
  adminSettingTitle: {
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "700",
  },
  adminSettingText: {
    color: "#93A1BC",
    fontSize: 13,
    lineHeight: 18,
  },
  userTable: {
    borderWidth: 1,
    borderColor: "#223A63",
    minWidth: 760,
  },
  userTableScrollContent: {
    minWidth: "100%",
  },
  userTableHeader: {
    flexDirection: "row",
    backgroundColor: "#0E1B36",
    borderBottomWidth: 1,
    borderBottomColor: "#223A63",
  },
  userTableHeaderText: {
    color: "#DCE8FF",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  userTableRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#223A63",
    borderTopWidth: 0,
    backgroundColor: "#102042",
  },
  userRowPressable: {
    width: "100%",
  },
  userCell: {
    paddingHorizontal: 10,
    paddingVertical: 12,
    justifyContent: "center",
  },
  userNameCell: {
    width: 180,
  },
  userPhoneCell: {
    width: 140,
  },
  userStatusCell: {
    width: 120,
  },
  userRoleCell: {
    width: 90,
  },
  userActionCell: {
    width: 230,
  },
  userTablePrimary: {
    color: "#F7FAFF",
    fontSize: 14,
    fontWeight: "700",
  },
  userTableText: {
    color: "#D1DBF0",
    fontSize: 13,
    lineHeight: 18,
  },
  userTableMuted: {
    color: "#93A1BC",
    fontSize: 12,
    lineHeight: 17,
  },
  pendingStateCard: {
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#0E1B36",
    padding: 16,
    gap: 8,
  },
  pendingStateTitle: {
    color: "#F7FAFF",
    fontSize: 17,
    fontWeight: "700",
  },
  pendingStateText: {
    color: "#9FB0CF",
    fontSize: 14,
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
    padding: 18,
    gap: 12,
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  modalHeaderTextWrap: {
    flex: 1,
    gap: 6,
  },
  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#0E1B36",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBodyScroll: {
    flexGrow: 0,
  },
  modalBodyContent: {
    gap: 12,
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
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  detailRow: {
    width: "48%",
    minHeight: 68,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#0E1B36",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  detailLabel: {
    color: "#93A1BC",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailValue: {
    color: "#F7FAFF",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  confirmPrimaryButton: {
    marginTop: 6,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E5AE0",
  },
  confirmDangerButton: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#8D2F2F",
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
