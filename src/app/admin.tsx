import { createElement, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { AppScreenBackground } from "@/components/AppScreenBackground";
import { CloseIcon } from "@/components/CloseIcon";
import { StickyHeaderBar } from "@/components/StickyHeaderBar";
import {
  createMatch,
  formatMatchDate,
  revertMatchSettlement,
  settleMatchOutcome,
  subscribeToSettlementBackupAvailability,
  subscribeToMatches,
  type SettlementBackupAvailability,
  updateMatchSettings,
} from "@/lib/matches";
import { deleteUserRecords, subscribeToAllUsers } from "@/lib/auth";
import { getIplTeamById, IPL_TEAMS, type IplTeam, type IplTeamId } from "@/lib/ipl-teams";
import type { MatchRecord } from "@/lib/match-types";
import type { UserProfileRecord } from "@/lib/auth-types";
import {
  createWeeklySpinCampaign,
  DEFAULT_WEEKLY_SPIN_AUDIENCE,
  deleteWeeklySpinCampaign,
  publishWeeklySpinCampaign,
  subscribeToWeeklySpinCampaigns,
  subscribeToWeeklySpinConfig,
  updateWeeklySpinConfig,
} from "@/lib/spin";
import type { WeeklySpinAudience, WeeklySpinCampaignRecord } from "@/lib/spin-types";
import { useAuth } from "@/providers/AuthProvider";

type PendingSettlement = {
  matchId: string;
  winner: "teamA" | "teamB" | "no_result";
  matchLabel: string;
  outcomeLabel: string;
} | null;
type PendingRevert = {
  matchId: string;
  matchLabel: string;
} | null;

type PickerMode = "date" | "time" | null;
type CampaignPickerTarget =
  | "start_date"
  | "start_time"
  | "end_date"
  | "end_time"
  | null;
type AdminMatchView = "live" | "results";
type AdminSection = "users" | "create_match" | "manage_match" | "weekly_spin";

export default function AdminScreen() {
  const router = useRouter();
  const { user, profile, isLoading: isAuthLoading } = useAuth();
  const { width } = useWindowDimensions();
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [backupAvailability, setBackupAvailability] = useState<SettlementBackupAvailability>({});
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
  const [pendingRevert, setPendingRevert] = useState<PendingRevert>(null);
  const [isReverting, setIsReverting] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminSection>("users");
  const [activeMatchView, setActiveMatchView] = useState<AdminMatchView>("live");
  const [pendingUserActionId, setPendingUserActionId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfileRecord | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [createMatchError, setCreateMatchError] = useState<string | null>(null);
  const [createMatchSuccess, setCreateMatchSuccess] = useState<string | null>(null);
  const [weeklySpinAudience, setWeeklySpinAudience] =
    useState<WeeklySpinAudience>(DEFAULT_WEEKLY_SPIN_AUDIENCE);
  const [isSavingWeeklySpin, setIsSavingWeeklySpin] = useState(false);
  const [weeklySpinCampaigns, setWeeklySpinCampaigns] = useState<WeeklySpinCampaignRecord[]>([]);
  const [campaignStartDate, setCampaignStartDate] = useState("");
  const [campaignStartTime, setCampaignStartTime] = useState("");
  const [campaignEndDate, setCampaignEndDate] = useState("");
  const [campaignEndTime, setCampaignEndTime] = useState("");
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [campaignPickerTarget, setCampaignPickerTarget] = useState<CampaignPickerTarget>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<WeeklySpinCampaignRecord | null>(null);
  const [isCampaignActionLoading, setIsCampaignActionLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToMatches((nextMatches) => {
      setMatches(nextMatches);
      setIsLoadingMatches(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToSettlementBackupAvailability(
      (nextAvailability) => {
        setBackupAvailability(nextAvailability);
      },
      () => {
        setBackupAvailability({});
      }
    );

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
    const unsubscribe = subscribeToWeeklySpinConfig(
      (config) => {
        setWeeklySpinAudience(config.audience);
      },
      () => {
        setWeeklySpinAudience(DEFAULT_WEEKLY_SPIN_AUDIENCE);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const now = new Date();
    const end = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
    setCampaignStartDate(formatDateValue(now));
    setCampaignStartTime(formatTimeValue(now));
    setCampaignEndDate(formatDateValue(end));
    setCampaignEndTime(formatTimeValue(end));
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToWeeklySpinCampaigns(
      (nextCampaigns) => {
        setWeeklySpinCampaigns(nextCampaigns);
      },
      () => {
        setWeeklySpinCampaigns([]);
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
  const filteredUsers = useMemo(() => {
    const normalizedQuery = userSearchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return users;
    }

    const digitQuery = normalizedQuery.replace(/[^0-9]/g, "");

    return users.filter((entry) => {
      const nameValue = entry.displayName.toLowerCase();
      const phoneValue = (entry.phoneNumber ?? "").replace(/[^0-9]/g, "");

      return (
        nameValue.includes(normalizedQuery) ||
        (!!digitQuery && phoneValue.includes(digitQuery))
      );
    });
  }, [userSearchQuery, users]);
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

  async function confirmRevertSettlement() {
    if (!pendingRevert || isReverting) {
      return;
    }

    try {
      setIsReverting(true);
      await revertMatchSettlement(pendingRevert.matchId, adminUserId);
      setPendingRevert(null);
      Alert.alert("Settlement reverted", "The match result and related records were restored.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to revert the match settlement.";
      Alert.alert("Revert failed", message);
    } finally {
      setIsReverting(false);
    }
  }

  async function handleDeleteUserRecords(targetUserId: string) {
    if (pendingUserActionId) {
      return;
    }

    try {
      setPendingUserActionId(targetUserId);
      await deleteUserRecords(targetUserId);
      setSelectedUser(null);
      Alert.alert("Records deleted", "The user's Firestore records have been removed.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete the user's records.";
      Alert.alert("Delete failed", message);
    } finally {
      setPendingUserActionId(null);
    }
  }

  async function handleWeeklySpinAudienceChange(nextAudience: WeeklySpinAudience) {
    if (isSavingWeeklySpin || nextAudience === weeklySpinAudience) {
      return;
    }

    try {
      setIsSavingWeeklySpin(true);
      await updateWeeklySpinConfig(nextAudience, adminUserId);
      setWeeklySpinAudience(nextAudience);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update weekly spin settings.";
      Alert.alert("Update failed", message);
    } finally {
      setIsSavingWeeklySpin(false);
    }
  }

  async function handleCreateWeeklySpinCampaign() {
    if (
      !campaignStartDate.trim() ||
      !campaignStartTime.trim() ||
      !campaignEndDate.trim() ||
      !campaignEndTime.trim()
    ) {
      Alert.alert("Missing details", "Fill start and end date/time for the campaign.");
      return;
    }

    const startAt = new Date(`${campaignStartDate}T${campaignStartTime}:00+05:30`);
    const endAt = new Date(`${campaignEndDate}T${campaignEndTime}:00+05:30`);

    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      Alert.alert("Invalid date", "Use YYYY-MM-DD and HH:MM in 24-hour format.");
      return;
    }

    if (endAt <= startAt) {
      Alert.alert("Invalid range", "End date/time must be after start date/time.");
      return;
    }

    if (isCreatingCampaign) {
      return;
    }

    try {
      setIsCreatingCampaign(true);
      await createWeeklySpinCampaign({
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        createdBy: adminUserId,
      });
      const nextDefaultEnd = new Date(startAt.getTime() + 4 * 24 * 60 * 60 * 1000);
      setCampaignEndDate(formatDateValue(nextDefaultEnd));
      setCampaignEndTime(formatTimeValue(nextDefaultEnd));
      Alert.alert("Campaign created", "Weekly spin campaign saved successfully.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create weekly spin campaign.";
      Alert.alert("Update failed", message);
    } finally {
      setIsCreatingCampaign(false);
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

  function openCampaignPicker(target: Exclude<CampaignPickerTarget, null>, mode: Exclude<PickerMode, null>) {
    const seed =
      target === "start_date" || target === "start_time"
        ? buildPickerSeed(campaignStartDate, campaignStartTime)
        : buildPickerSeed(campaignEndDate, campaignEndTime);
    setPickerValue(seed);
    setCampaignPickerTarget(target);
    setPickerMode(mode);
  }

  function handleCampaignPickerChange(nextValue?: Date) {
    if (!nextValue) {
      setPickerMode(null);
      setCampaignPickerTarget(null);
      return;
    }

    if (campaignPickerTarget === "start_date") {
      setCampaignStartDate(formatDateValue(nextValue));
    } else if (campaignPickerTarget === "start_time") {
      const nextStartTime = formatTimeValue(nextValue);
      setCampaignStartTime(nextStartTime);

      const startSeed = buildPickerSeed(campaignStartDate, nextStartTime);
      const nextDefaultEnd = new Date(startSeed.getTime() + 4 * 24 * 60 * 60 * 1000);
      setCampaignEndDate(formatDateValue(nextDefaultEnd));
      setCampaignEndTime(formatTimeValue(nextDefaultEnd));
    } else if (campaignPickerTarget === "end_date") {
      setCampaignEndDate(formatDateValue(nextValue));
    } else if (campaignPickerTarget === "end_time") {
      setCampaignEndTime(formatTimeValue(nextValue));
    }

    setPickerValue(nextValue);
    setPickerMode(null);
    setCampaignPickerTarget(null);
  }

  async function handlePublishCampaign(campaign: WeeklySpinCampaignRecord) {
    if (isCampaignActionLoading) {
      return;
    }

    try {
      setIsCampaignActionLoading(true);
      await publishWeeklySpinCampaign(campaign.id, adminUserId);
      setSelectedCampaign(null);
      Alert.alert("Campaign published", `Campaign #${campaign.campaignNumber} is now active.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to publish campaign.";
      Alert.alert("Update failed", message);
    } finally {
      setIsCampaignActionLoading(false);
    }
  }

  async function handleDeleteCampaign(campaign: WeeklySpinCampaignRecord) {
    if (isCampaignActionLoading) {
      return;
    }

    try {
      setIsCampaignActionLoading(true);
      await deleteWeeklySpinCampaign(campaign.id, adminUserId);
      setSelectedCampaign(null);
      Alert.alert("Campaign deleted", `Campaign #${campaign.campaignNumber} was deleted.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete campaign.";
      Alert.alert("Delete failed", message);
    } finally {
      setIsCampaignActionLoading(false);
    }
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
  const revertDialog = pendingRevert ? (
    <View style={styles.modalOverlay}>
      <Pressable style={styles.modalBackdrop} onPress={() => setPendingRevert(null)} />
      <View style={styles.confirmCard}>
        <Text style={styles.confirmTitle}>Revert Settlement</Text>
        <Text style={styles.confirmText}>
          Restore {pendingRevert.matchLabel} to its pre-settlement state?
        </Text>
        <Text style={styles.confirmHint}>
          This will restore users, predictions, referrals, and remove settlement-generated wallet
          transactions for that match.
        </Text>

        <Pressable
          style={[styles.confirmDangerButton, isReverting && styles.buttonDisabled]}
          onPress={confirmRevertSettlement}
          disabled={isReverting}
        >
          {isReverting ? (
            <ActivityIndicator size="small" color="#F7FAFF" />
          ) : (
            <Text style={styles.confirmPrimaryButtonText}>Confirm Revert</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.confirmSecondaryButton, isReverting && styles.buttonDisabled]}
          onPress={() => setPendingRevert(null)}
          disabled={isReverting}
        >
          <Text style={styles.confirmSecondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  ) : null;
  const userDialog = selectedUser ? (
    <View style={styles.modalOverlay}>
      <Pressable style={styles.modalBackdrop} onPress={() => setSelectedUser(null)} />
      <View style={styles.confirmCard}>
        <View style={styles.modalHeader}>
            <View style={styles.modalHeaderTextWrap}>
              <Text style={styles.confirmTitle}>User Details</Text>
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
          </View>
          <Text style={styles.confirmHint}>
            This deletes app records only. Firebase Auth will remain until you remove it manually.
          </Text>

          <Pressable
            style={[styles.confirmDangerButton, pendingUserActionId && styles.buttonDisabled]}
            onPress={() => handleDeleteUserRecords(selectedUser.uid)}
            disabled={!!pendingUserActionId}
          >
            {pendingUserActionId === selectedUser.uid ? (
              <ActivityIndicator size="small" color="#F7FAFF" />
            ) : (
              <Text style={styles.confirmPrimaryButtonText}>Delete User Records</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.confirmSecondaryButton, pendingUserActionId && styles.buttonDisabled]}
            onPress={() => setSelectedUser(null)}
            disabled={!!pendingUserActionId}
          >
            <Text style={styles.confirmSecondaryButtonText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  ) : null;
  const campaignDialog = selectedCampaign ? (
    <View style={styles.modalOverlay}>
      <Pressable style={styles.modalBackdrop} onPress={() => setSelectedCampaign(null)} />
      <View style={styles.confirmCard}>
        <Text style={styles.confirmTitle}>Campaign #{selectedCampaign.campaignNumber}</Text>
        <Text style={styles.confirmText}>Publish or delete this campaign?</Text>
        <Text style={styles.confirmHint}>
          Start: {formatMatchDate(selectedCampaign.startAt)}{"\n"}
          End: {formatMatchDate(selectedCampaign.endAt)}
        </Text>
        <Pressable
          style={[styles.confirmPrimaryButton, isCampaignActionLoading && styles.buttonDisabled]}
          onPress={() => void handlePublishCampaign(selectedCampaign)}
          disabled={isCampaignActionLoading}
        >
          {isCampaignActionLoading ? (
            <ActivityIndicator size="small" color="#F7FAFF" />
          ) : (
            <Text style={styles.confirmPrimaryButtonText}>Publish Campaign</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.confirmDangerButton, isCampaignActionLoading && styles.buttonDisabled]}
          onPress={() => void handleDeleteCampaign(selectedCampaign)}
          disabled={isCampaignActionLoading}
        >
          <Text style={styles.confirmPrimaryButtonText}>Delete</Text>
        </Pressable>
        <Pressable
          style={[styles.confirmSecondaryButton, isCampaignActionLoading && styles.buttonDisabled]}
          onPress={() => setSelectedCampaign(null)}
          disabled={isCampaignActionLoading}
        >
          <Text style={styles.confirmSecondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.screen}>
      <AppScreenBackground />
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          stickyHeaderIndices={[0]}
          contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.stickyHeaderWrap}>
            <StickyHeaderBar
              title="Admin"
              leftSlot={
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
              }
            />
          </View>
          <View style={[styles.pageShell, isDesktop && styles.pageShellDesktop]}>
            <View style={styles.sectionTabs}>
              <AdminTabButton
                label="Users"
                active={activeSection === "users"}
                onPress={() => setActiveSection("users")}
              />
              <AdminTabButton
                label="+ Match"
                active={activeSection === "create_match"}
                onPress={() => setActiveSection("create_match")}
              />
              <AdminTabButton
                label="Manage Match"
                active={activeSection === "manage_match"}
                onPress={() => setActiveSection("manage_match")}
              />
              <AdminTabButton
                label="Weekly Spin"
                active={activeSection === "weekly_spin"}
                onPress={() => setActiveSection("weekly_spin")}
              />
            </View>

            {activeSection === "create_match" ? (
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
            ) : activeSection === "manage_match" ? (
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
                      const backupInfo = backupAvailability[match.id];
                      const hasBackup = !!backupInfo?.hasBackup;

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
                              onValueChange={(value: boolean) => handleToggleEditing(match.id, value)}
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
                            <View style={styles.lockedActionsWrap}>
                              <Text style={styles.lockedActionsText}>
                                {hasBackup
                                  ? "Result already recorded. Backup available for revert."
                                  : "Result already recorded. No backup available for revert."}
                              </Text>
                              {hasBackup ? (
                                <Pressable
                                  style={[
                                    styles.revertButton,
                                    isReverting && styles.actionButtonDisabled,
                                  ]}
                                  onPress={() =>
                                    setPendingRevert({
                                      matchId: match.id,
                                      matchLabel: `${match.teamAShort} vs ${match.teamBShort}`,
                                    })
                                  }
                                  disabled={isReverting}
                                >
                                  <Text style={styles.revertButtonText}>Revert Settlement</Text>
                                </Pressable>
                              ) : (
                                <Text style={styles.noBackupText}>No backup found for this match.</Text>
                              )}
                            </View>
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
            ) : activeSection === "weekly_spin" ? (
              <View style={[styles.card, isDesktop && styles.cardDesktop]}>
                <Text style={styles.cardTitle}>Weekly Spin Access</Text>
                <Text style={styles.sectionDescription}>
                  Control when users can see the weekly spin on Home.
                </Text>
                <View style={styles.viewTabs}>
                  <AdminTabButton
                    label="Disabled"
                    active={weeklySpinAudience === "disabled"}
                    onPress={() => void handleWeeklySpinAudienceChange("disabled")}
                    compact
                  />
                  <AdminTabButton
                    label="All Active Users"
                    active={weeklySpinAudience === "all_active_users"}
                    onPress={() => void handleWeeklySpinAudienceChange("all_active_users")}
                    compact
                  />
                  <AdminTabButton
                    label="Eligible Users"
                    active={weeklySpinAudience === "eligible_users_only"}
                    onPress={() => void handleWeeklySpinAudienceChange("eligible_users_only")}
                    compact
                  />
                </View>
                <View style={styles.weeklySpinFlatSection}>
                  <Text style={styles.selectionSummaryTitle}>Current Mode</Text>
                  <Text style={styles.selectionSummaryText}>
                    {weeklySpinAudience === "disabled"
                      ? "No user can see Weekly Spin."
                      : weeklySpinAudience === "all_active_users"
                        ? "Users who have played at least one match can see Weekly Spin."
                        : "Only users who have played at least 35% of completed matches can see Weekly Spin."}
                  </Text>
                  {isSavingWeeklySpin ? (
                    <Text style={styles.selectionSummaryText}>Saving changes...</Text>
                  ) : null}
                </View>
                <View style={styles.weeklySpinFlatSection}>
                  <Text style={styles.selectionSummaryTitle}>Create Spin Campaign</Text>
                  <Text style={styles.selectorLabel}>Start Date</Text>
                  {Platform.OS === "web" ? (
                    <WebDateTimeInput
                      type="date"
                      value={campaignStartDate}
                      onChange={setCampaignStartDate}
                      placeholder="YYYY-MM-DD"
                    />
                  ) : (
                    <Pressable
                      style={styles.inputButton}
                      onPress={() => openCampaignPicker("start_date", "date")}
                    >
                      <Text style={[styles.inputButtonText, !campaignStartDate && styles.placeholderText]}>
                        {campaignStartDate || "YYYY-MM-DD"}
                      </Text>
                    </Pressable>
                  )}
                  <Text style={styles.selectorLabel}>Start Time</Text>
                  {Platform.OS === "web" ? (
                    <WebDateTimeInput
                      type="time"
                      value={campaignStartTime}
                      onChange={setCampaignStartTime}
                      placeholder="HH:MM"
                    />
                  ) : (
                    <Pressable
                      style={styles.inputButton}
                      onPress={() => openCampaignPicker("start_time", "time")}
                    >
                      <Text style={[styles.inputButtonText, !campaignStartTime && styles.placeholderText]}>
                        {campaignStartTime || "HH:MM"}
                      </Text>
                    </Pressable>
                  )}
                  <Text style={styles.selectorLabel}>End Date</Text>
                  {Platform.OS === "web" ? (
                    <WebDateTimeInput
                      type="date"
                      value={campaignEndDate}
                      onChange={setCampaignEndDate}
                      placeholder="YYYY-MM-DD"
                    />
                  ) : (
                    <Pressable
                      style={styles.inputButton}
                      onPress={() => openCampaignPicker("end_date", "date")}
                    >
                      <Text style={[styles.inputButtonText, !campaignEndDate && styles.placeholderText]}>
                        {campaignEndDate || "YYYY-MM-DD"}
                      </Text>
                    </Pressable>
                  )}
                  <Text style={styles.selectorLabel}>End Time</Text>
                  {Platform.OS === "web" ? (
                    <WebDateTimeInput
                      type="time"
                      value={campaignEndTime}
                      onChange={setCampaignEndTime}
                      placeholder="HH:MM"
                    />
                  ) : (
                    <Pressable
                      style={styles.inputButton}
                      onPress={() => openCampaignPicker("end_time", "time")}
                    >
                      <Text style={[styles.inputButtonText, !campaignEndTime && styles.placeholderText]}>
                        {campaignEndTime || "HH:MM"}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={[styles.primaryButton, isCreatingCampaign && styles.buttonDisabled]}
                    onPress={() => void handleCreateWeeklySpinCampaign()}
                    disabled={isCreatingCampaign}
                  >
                    {isCreatingCampaign ? (
                      <ActivityIndicator size="small" color="#F7FAFF" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Save Campaign</Text>
                    )}
                  </Pressable>
                </View>
                <View style={styles.weeklySpinFlatSection}>
                  <Text style={styles.selectionSummaryTitle}>Campaign History</Text>
                  <View style={styles.campaignTable}>
                    <View style={styles.campaignTableHeader}>
                      <View style={[styles.campaignCell, styles.campaignNumberCol]}>
                        <Text style={styles.userTableHeaderText}>#</Text>
                      </View>
                      <View style={[styles.campaignCell, styles.campaignStartCol]}>
                        <Text style={styles.userTableHeaderText}>Start</Text>
                      </View>
                      <View style={[styles.campaignCell, styles.campaignEndCol]}>
                        <Text style={styles.userTableHeaderText}>End</Text>
                      </View>
                      <View style={[styles.campaignCell, styles.campaignStatusCol]}>
                        <Text style={styles.userTableHeaderText}>Status</Text>
                      </View>
                    </View>
                    {weeklySpinCampaigns.length ? (
                      weeklySpinCampaigns.map((campaign) => (
                        <Pressable
                          key={campaign.id}
                          style={styles.campaignTableRow}
                          onPress={() => setSelectedCampaign(campaign)}
                        >
                          <View style={[styles.campaignCell, styles.campaignNumberCol]}>
                            <Text style={styles.userTablePrimary}>{campaign.campaignNumber}</Text>
                          </View>
                          <View style={[styles.campaignCell, styles.campaignStartCol]}>
                            <Text style={styles.userTableText}>{formatMatchDate(campaign.startAt)}</Text>
                          </View>
                          <View style={[styles.campaignCell, styles.campaignEndCol]}>
                            <Text style={styles.userTableText}>{formatMatchDate(campaign.endAt)}</Text>
                          </View>
                          <View style={[styles.campaignCell, styles.campaignStatusCol]}>
                            <Text style={styles.userTableText}>{campaign.status}</Text>
                          </View>
                        </Pressable>
                      ))
                    ) : (
                      <View style={styles.campaignTableRow}>
                        <View style={styles.campaignEmptyCell}>
                          <Text style={styles.userTableMuted}>No campaigns created yet.</Text>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            ) : (
              <View style={[styles.card, isDesktop && styles.cardDesktop]}>
                  <Text style={styles.cardTitle}>Users List</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Search by name or mobile number"
                    placeholderTextColor="#4C5D7C"
                    value={userSearchQuery}
                    onChangeText={setUserSearchQuery}
                  />
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
                          <Text style={styles.userTableHeaderText}>Email</Text>
                        </View>
                      </View>
                      {isLoadingUsers ? (
                        <View style={styles.loadingState}>
                          <ActivityIndicator size="small" color="#1E5AE0" />
                        </View>
                      ) : filteredUsers.length ? (
                        filteredUsers.map((entry) => (
                          <UserRow key={entry.uid} user={entry} onRowPress={() => setSelectedUser(entry)} />
                        ))
                      ) : (
                        <Text style={styles.emptyText}>
                          {userSearchQuery.trim() ? "No users matched your search." : "No users found yet."}
                        </Text>
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
          {revertDialog}
          {userDialog}
          {campaignDialog}
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
            visible={!!pendingRevert}
            transparent
            animationType="fade"
            onRequestClose={() => setPendingRevert(null)}
          >
            {revertDialog}
          </Modal>
          <Modal
            visible={!!selectedUser}
            transparent
            animationType="fade"
            onRequestClose={() => setSelectedUser(null)}
          >
            {userDialog}
          </Modal>
          <Modal
            visible={!!selectedCampaign}
            transparent
            animationType="fade"
            onRequestClose={() => setSelectedCampaign(null)}
          >
            {campaignDialog}
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

            if (campaignPickerTarget) {
              handleCampaignPickerChange(date);
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

function formatUserAccessStatus(_user: UserProfileRecord) {
  return "Active";
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
    paddingHorizontal: 18,
    gap: 22,
  },
  contentDesktop: {
    paddingBottom: 40,
  },
  stickyHeaderWrap: {
    paddingTop: 18,
    marginBottom: 14,
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
    backgroundColor: "#152747",
    borderWidth: 1,
    borderColor: "#355586",
    marginTop: 2,
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
  sectionDescription: {
    color: "#9FB0CF",
    fontSize: 14,
    lineHeight: 20,
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
  weeklySpinFlatSection: {
    gap: 10,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  campaignTable: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#223A63",
    borderRadius: 14,
    overflow: "hidden",
  },
  campaignTableHeader: {
    flexDirection: "row",
    backgroundColor: "#0E1B36",
    borderBottomWidth: 1,
    borderBottomColor: "#223A63",
  },
  campaignTableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#223A63",
    backgroundColor: "#102042",
  },
  campaignCell: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    justifyContent: "center",
  },
  campaignNumberCol: {
    flex: 0.5,
  },
  campaignStartCol: {
    flex: 1.4,
  },
  campaignEndCol: {
    flex: 1.4,
  },
  campaignStatusCol: {
    flex: 0.9,
  },
  campaignEmptyCell: {
    width: "100%",
    paddingHorizontal: 8,
    paddingVertical: 12,
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
  lockedActionsWrap: {
    gap: 10,
  },
  revertButton: {
    alignSelf: "flex-start",
    minWidth: 136,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#8D2F2F",
    paddingHorizontal: 14,
  },
  revertButtonText: {
    color: "#F7FAFF",
    fontSize: 14,
    fontWeight: "700",
  },
  noBackupText: {
    color: "#93A1BC",
    fontSize: 13,
    lineHeight: 18,
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
