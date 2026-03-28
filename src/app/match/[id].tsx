import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { BackIcon } from "@/components/BackIcon";
import { CoinAmount } from "@/components/CoinAmount";
import { useAuth } from "@/providers/AuthProvider";
import {
  formatMatchDate,
  getBettingState,
  isMatchLocked,
  subscribeToMatch,
} from "@/lib/matches";
import {
  deletePrediction,
  placeOrEditPrediction,
  subscribeToMatchPredictions,
  subscribeToUserPrediction,
} from "@/lib/predictions";
import type { MatchRecord } from "@/lib/match-types";
import type { PredictionSelection, PredictionRecord } from "@/lib/prediction-types";

function teamLabel(match: MatchRecord, selection: PredictionSelection) {
  return selection === "teamA" ? match.teamAShort : match.teamBShort;
}

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile, isLoading: isAuthLoading } = useAuth();
  const { width } = useWindowDimensions();
  const [match, setMatch] = useState<MatchRecord | null>(null);
  const [prediction, setPrediction] = useState<PredictionRecord | null>(null);
  const [publicPredictions, setPublicPredictions] = useState<PredictionRecord[]>([]);
  const [selection, setSelection] = useState<PredictionSelection>("teamA");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingMatch, setIsLoadingMatch] = useState(true);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isEditingPrediction, setIsEditingPrediction] = useState(false);

  useEffect(() => {
    if (!id) {
      return;
    }

    setSelection("teamA");
    setAmount("");
    setIsConfirmVisible(false);
    setIsDeleteConfirmVisible(false);
    setIsEditingPrediction(false);

    const unsubscribe = subscribeToMatch(
      id,
      (nextMatch) => {
        setMatch(nextMatch);
        setMatchError(null);
        setIsLoadingMatch(false);
      },
      (error) => {
        setMatchError(`Match read failed: ${error.message}`);
        setIsLoadingMatch(false);
      }
    );

    return unsubscribe;
  }, [id]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setToastMessage(null);
    }, 3000);

    return () => clearTimeout(timeoutId);
  }, [toastMessage]);

  useEffect(() => {
    if (!id || !user) {
      setPrediction(null);
      setSelection("teamA");
      setAmount("");
      setIsEditingPrediction(false);
      return;
    }

    const unsubscribe = subscribeToUserPrediction(
      id,
      user.uid,
      (nextPrediction) => {
        setPrediction(nextPrediction);
        setPredictionError(null);
        setSelection(nextPrediction?.selectedTeam ?? "teamA");
        setAmount(nextPrediction ? String(nextPrediction.amount) : "");
        setIsEditingPrediction(false);
      },
      (error) => {
        setPredictionError(`Your prediction read failed: ${error.message}`);
      }
    );

    return unsubscribe;
  }, [id, user]);

  useEffect(() => {
    if (!id) {
      return;
    }

    const unsubscribe = subscribeToMatchPredictions(
      id,
      setPublicPredictions,
      (error) => {
        setPredictionError(`Public predictions read failed: ${error.message}`);
      }
    );
    return unsubscribe;
  }, [id]);

  const locked = match ? isMatchLocked(match.lockAt) : false;
  const bettingState = match ? getBettingState(match) : null;
  const showCompletedPublicView =
    bettingState === "completed" || bettingState === "bet_locked";
  const canEdit =
    !!match &&
    bettingState === "bet_open" &&
    (!prediction || match.isEditableBeforeLock);
  const isEditMode = !prediction || isEditingPrediction;
  const inputsEditable = canEdit && isEditMode;
  const isDesktop = width >= 1024;

  const resultLabel = useMemo(() => {
    if (!match?.winner) {
      return null;
    }

    if (match.winner === "no_result") {
      return "No result";
    }

    return teamLabel(match, match.winner);
  }, [match]);

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

  if (isLoadingMatch) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#1E5AE0" />
          <Text style={styles.loadingText}>Loading match...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!match) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Match not found</Text>
          <Text style={styles.emptyText}>This fixture does not exist anymore.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentMatch = match;
  const currentUserId = user.uid;

  function validatePredictionInput() {
    const parsedAmount = Number(amount);

    if (!profile) {
      Alert.alert("Profile missing", "Wait for profile sync and try again.");
      return null;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Invalid amount", "Enter a valid bet amount.");
      return null;
    }

    return parsedAmount;
  }

  function handleOpenConfirm() {
    const parsedAmount = validatePredictionInput();

    if (parsedAmount == null) {
      return;
    }

    setIsConfirmVisible(true);
  }

  function handlePrimaryAction() {
    if (prediction && !isEditingPrediction) {
      setIsEditingPrediction(true);
      return;
    }

    handleOpenConfirm();
  }

  async function handleSubmitPrediction() {
    const parsedAmount = validatePredictionInput();

    if (parsedAmount == null || !profile) {
      return;
    }

    setIsSubmitting(true);

    try {
      const isEditingPrediction = !!prediction;

      await placeOrEditPrediction({
        match: currentMatch,
        userId: currentUserId,
        userDisplayName: profile.displayName,
        selection,
        amount: parsedAmount,
      });

      setIsConfirmVisible(false);
      router.replace("/(tabs)/my-bets");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save prediction.";

      if (
        message === "Predictions are locked for this match." ||
        message === "Betting opens 24 hours before the match starts."
      ) {
        setIsConfirmVisible(false);
        setToastMessage(
          message === "Predictions are locked for this match."
            ? "Sorry, your bet could not be placed as the match was locked."
            : "Betting for this match opens 24 hours before the start time."
        );
        return;
      }

      Alert.alert("Prediction failed", message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDeletePrediction() {
    if (!prediction || isDeleting) {
      return;
    }

    setIsDeleteConfirmVisible(true);
  }

  async function confirmDeletePrediction() {
    try {
      setIsDeleting(true);
      await deletePrediction({
        match: currentMatch,
        userId: currentUserId,
      });
      setIsDeleteConfirmVisible(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete your bet.";
      Alert.alert("Delete failed", message);
    } finally {
      setIsDeleting(false);
    }
  }

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

                  router.replace("/(tabs)/home");
                }}
              >
                <BackIcon />
              </Pressable>
            </View>

            {matchError ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Firestore error</Text>
                <Text style={styles.errorText}>{matchError}</Text>
              </View>
            ) : null}

            <View style={styles.heroCard}>
              <Text style={styles.matchMeta}>Match {currentMatch.matchNumber}</Text>
              <Text style={styles.matchTeams}>
                {currentMatch.teamAName} vs {currentMatch.teamBName}
              </Text>
              <Text style={styles.matchTime}>Starts {formatMatchDate(currentMatch.startAt)}</Text>
              <Text style={styles.matchTime}>Locks {formatMatchDate(currentMatch.lockAt)}</Text>
              <Text style={styles.matchHint}>
                One active prediction per user. Editing uses full replacement before lock.
              </Text>
              {resultLabel ? <Text style={styles.resultText}>Result: {resultLabel}</Text> : null}
            </View>

            {!showCompletedPublicView ? (
              <View style={styles.card}>
                <View style={styles.predictionHeaderRow}>
                  <Text style={styles.cardTitle}>Your Prediction</Text>
                  <View style={styles.balanceTextRow}>
                    <Text style={styles.balanceText}>Balance:</Text>
                    <CoinAmount
                      value={(profile?.balance ?? 0).toLocaleString("en-IN")}
                      color="#9FB0CF"
                      size={14}
                      weight="700"
                      iconSize={11}
                    />
                  </View>
                </View>
                {predictionError ? (
                  <View style={styles.inlineError}>
                    <Text style={styles.errorText}>{predictionError}</Text>
                  </View>
                ) : null}

                <View style={styles.selectionRow}>
                  <Pressable
                    style={[
                      styles.selectionButton,
                      selection === "teamA" && styles.selectionButtonActive,
                    ]}
                    onPress={() => setSelection("teamA")}
                    disabled={!inputsEditable}
                  >
                    <Text
                      style={[
                        styles.selectionText,
                        selection === "teamA" && styles.selectionTextActive,
                      ]}
                    >
                      {currentMatch.teamAShort}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.selectionButton,
                      selection === "teamB" && styles.selectionButtonActive,
                    ]}
                    onPress={() => setSelection("teamB")}
                    disabled={!inputsEditable}
                  >
                    <Text
                      style={[
                        styles.selectionText,
                        selection === "teamB" && styles.selectionTextActive,
                      ]}
                    >
                      {currentMatch.teamBShort}
                    </Text>
                  </Pressable>
                </View>

                <TextInput
                  style={[styles.input, !inputsEditable && styles.inputDisabled]}
                  placeholder="Bet amount"
                  placeholderTextColor="#4C5D7C"
                  keyboardType="number-pad"
                  value={amount}
                  editable={inputsEditable}
                  onChangeText={(value) => setAmount(value.replace(/[^0-9]/g, ""))}
                />

                {prediction ? (
                  <Text style={styles.statusTextInline}>
                    Active pick: {teamLabel(currentMatch, prediction.selectedTeam)} for{" "}
                    {prediction.amount.toLocaleString("en-IN")} coins
                  </Text>
                ) : null}

                {canEdit ? (
                  <>
                    <View style={styles.actionRow}>
                      <Pressable
                        style={[
                          styles.primaryButton,
                          styles.actionButton,
                          (isSubmitting || isDeleting) && styles.buttonDisabled,
                        ]}
                        onPress={handlePrimaryAction}
                        disabled={isSubmitting || isDeleting}
                      >
                        <Text style={styles.primaryButtonText}>
                          {prediction
                            ? isEditingPrediction
                              ? "Review Bet"
                              : "Edit Bet"
                            : "Review Prediction"}
                        </Text>
                      </Pressable>

                      {prediction ? (
                        <Pressable
                          style={[
                            styles.deleteButton,
                            styles.actionButton,
                            isDeleting && styles.buttonDisabled,
                          ]}
                          onPress={handleDeletePrediction}
                          disabled={isDeleting || isSubmitting}
                        >
                          <Text style={styles.deleteButtonText}>
                            {isDeleting ? "Deleting..." : "Delete Bet"}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </>
                ) : (
                  <Text style={styles.lockedText}>
                    {bettingState === "closed"
                      ? "Betting opens 24 hours before this match starts."
                      : locked
                        ? "Predictions are locked for this match."
                        : "Admin has disabled editing for this fixture."}
                  </Text>
                )}
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Public Predictions</Text>
              {publicPredictions.length ? (
                publicPredictions.map((entry) => (
                  <View
                    key={entry.id}
                    style={[
                      styles.publicRow,
                      showCompletedPublicView &&
                        entry.userId === currentUserId &&
                        styles.publicRowCurrentUser,
                    ]}
                  >
                    <Text
                      style={[
                        styles.publicName,
                        showCompletedPublicView &&
                          entry.userId === currentUserId &&
                          styles.publicCurrentUserText,
                      ]}
                    >
                      {entry.userDisplayName}
                    </Text>
                    <Text
                      style={[
                        styles.publicChoice,
                        showCompletedPublicView &&
                          entry.userId === currentUserId &&
                          styles.publicCurrentUserText,
                      ]}
                    >
                      {teamLabel(currentMatch, entry.selectedTeam)}
                    </Text>
                    <CoinAmount
                      value={entry.amount.toLocaleString("en-IN")}
                      color={
                        showCompletedPublicView && entry.userId === currentUserId
                          ? "#F7FAFF"
                          : "#4AE39A"
                      }
                      size={14}
                      weight="700"
                      iconSize={11}
                      align="right"
                      textStyle={styles.publicAmount}
                    />
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No predictions placed for this match.</Text>
              )}
            </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={isConfirmVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!isSubmitting) {
            setIsConfirmVisible(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              if (!isSubmitting) {
                setIsConfirmVisible(false);
              }
            }}
          />
          <View style={styles.confirmSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Confirm Prediction</Text>
              <View style={styles.helpBadge}>
                <Text style={styles.helpBadgeText}>?</Text>
              </View>
            </View>

            <View style={styles.confirmMatchCard}>
              <View style={styles.confirmMatchBody}>
                <Text style={styles.confirmEyebrow}>
                  {bettingState === "closed"
                    ? "Opens In 24h Window"
                    : locked
                      ? "Locked Match"
                      : "Live Tonight"}
                </Text>
                <Text style={styles.confirmMatchTitle}>
                  {currentMatch.teamAName} vs {currentMatch.teamBName}
                </Text>
                <Text style={styles.confirmMatchMeta}>
                  {formatMatchDate(currentMatch.startAt)}
                </Text>
              </View>
              <View style={styles.confirmBadge}>
                <Text style={styles.confirmBadgeText}>
                  {teamLabel(currentMatch, selection)}
                </Text>
              </View>
            </View>

            <View style={styles.confirmDetails}>
              <ConfirmRow
                label="Selected Team"
                value={teamLabel(currentMatch, selection)}
                valueAccent
              />
              <ConfirmRow
                label="Bet Amount"
                value={
                  <CoinAmount
                    value={Number(amount || 0).toLocaleString("en-IN")}
                    color="#2463EB"
                    size={17}
                    weight="800"
                    iconSize={13}
                    align="right"
                  />
                }
                valueAccent
              />
              <View style={styles.confirmDivider} />
              <ConfirmRow
                label="Current Balance"
                value={
                  <CoinAmount
                    value={(profile?.balance ?? 0).toLocaleString("en-IN")}
                    color="#F7FAFF"
                    size={16}
                    weight="700"
                    iconSize={12}
                    align="right"
                  />
                }
              />
            </View>

            <Pressable
              style={[styles.confirmButton, isSubmitting && styles.buttonDisabled]}
              onPress={handleSubmitPrediction}
              disabled={isSubmitting}
            >
              <Text style={styles.confirmButtonText}>
                {isSubmitting
                  ? "Confirming..."
                  : prediction
                    ? "Confirm Update"
                    : "Confirm Prediction"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.cancelButton}
              onPress={() => setIsConfirmVisible(false)}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isDeleteConfirmVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (!isDeleting) {
            setIsDeleteConfirmVisible(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              if (!isDeleting) {
                setIsDeleteConfirmVisible(false);
              }
            }}
          />
          <View style={styles.deleteConfirmCard}>
            <Text style={styles.deleteConfirmTitle}>Delete Bet</Text>
            <Text style={styles.deleteConfirmText}>
              This will remove your current bet and refund the full amount to your balance.
            </Text>
            <Pressable
              style={[styles.deleteConfirmButton, isDeleting && styles.buttonDisabled]}
              onPress={confirmDeletePrediction}
              disabled={isDeleting}
            >
              <Text style={styles.deleteConfirmButtonText}>
                {isDeleting ? "Deleting..." : "Confirm Delete"}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.cancelButton, isDeleting && styles.buttonDisabled]}
              onPress={() => setIsDeleteConfirmVisible(false)}
              disabled={isDeleting}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {toastMessage ? (
        <View style={[styles.toastWrap, styles.toastNoPointerEvents]}>
          <View style={styles.toastCard}>
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function ConfirmRow({
  label,
  value,
  valueAccent = false,
}: {
  label: string;
  value: ReactNode;
  valueAccent?: boolean;
}) {
  return (
    <View style={styles.confirmRow}>
      <Text style={styles.confirmLabel}>{label}</Text>
      <View style={styles.confirmValueWrap}>
        {typeof value === "string" ? (
          <Text style={[styles.confirmValue, valueAccent && styles.confirmValueAccent]}>
            {value}
          </Text>
        ) : (
          value
        )}
      </View>
    </View>
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
    padding: 18,
    paddingTop: 48,
    gap: 18,
  },
  contentDesktop: {
    paddingTop: 28,
    paddingBottom: 40,
  },
  pageShell: {
    width: "100%",
    alignSelf: "center",
    gap: 18,
  },
  pageShellDesktop: {
    maxWidth: 920,
    gap: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
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
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    backgroundColor: "#07152E",
  },
  loadingText: {
    color: "#DDE5F7",
    fontSize: 17,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#07152E",
  },
  emptyTitle: {
    color: "#F7FAFF",
    fontSize: 24,
    fontWeight: "800",
  },
  emptyText: {
    color: "#9FB0CF",
    fontSize: 15,
    lineHeight: 22,
  },
  errorCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#7A2A2A",
    backgroundColor: "#311515",
    padding: 18,
    gap: 8,
  },
  inlineError: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#7A2A2A",
    backgroundColor: "#311515",
    padding: 14,
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
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 20,
    gap: 8,
  },
  matchMeta: {
    color: "#8FA5CC",
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  matchTeams: {
    color: "#F7FAFF",
    fontSize: 28,
    fontWeight: "800",
  },
  matchTime: {
    color: "#DDE5F7",
    fontSize: 15,
    fontWeight: "600",
  },
  matchHint: {
    color: "#8FA5CC",
    fontSize: 14,
    lineHeight: 20,
  },
  resultText: {
    color: "#4AE39A",
    fontSize: 16,
    fontWeight: "700",
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 16,
    gap: 10,
  },
  predictionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitle: {
    color: "#F7FAFF",
    fontSize: 18,
    fontWeight: "700",
  },
  balanceText: {
    color: "#9FB0CF",
    fontSize: 14,
  },
  balanceTextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  selectionRow: {
    flexDirection: "row",
    gap: 10,
  },
  selectionButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334C76",
    backgroundColor: "#0E1B36",
    alignItems: "center",
    justifyContent: "center",
  },
  selectionButtonActive: {
    borderColor: "#1E5AE0",
    backgroundColor: "#16356D",
  },
  selectionText: {
    color: "#A6B4D1",
    fontSize: 16,
    fontWeight: "700",
  },
  selectionTextActive: {
    color: "#F7FAFF",
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334C76",
    backgroundColor: "#162645",
    paddingHorizontal: 14,
    height: 50,
    color: "#F7FAFF",
    fontSize: 15,
  },
  inputDisabled: {
    opacity: 0.65,
  },
  statusTextInline: {
    color: "#9FB0CF",
    fontSize: 13,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
  primaryButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#1E5AE0",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#F7FAFF",
    fontSize: 16,
    fontWeight: "700",
  },
  deleteButton: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#7A2A2A",
    backgroundColor: "#311515",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: {
    color: "#FFD7D7",
    fontSize: 15,
    fontWeight: "700",
  },
  deleteConfirmCard: {
    marginHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 22,
    gap: 14,
    justifyContent: "center",
  },
  deleteConfirmTitle: {
    color: "#F7FAFF",
    fontSize: 22,
    fontWeight: "800",
  },
  deleteConfirmText: {
    color: "#DDE5F7",
    fontSize: 15,
    lineHeight: 22,
  },
  deleteConfirmButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: "#8F2432",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteConfirmButtonText: {
    color: "#F7FAFF",
    fontSize: 16,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  lockedText: {
    color: "#F9B17A",
    fontSize: 13,
    lineHeight: 18,
  },
  publicRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#0E1B36",
    padding: 14,
  },
  publicRowCurrentUser: {
    borderColor: "#2C68E6",
    backgroundColor: "#16356D",
  },
  publicName: {
    flex: 1,
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "700",
  },
  publicChoice: {
    color: "#8FB5FF",
    fontSize: 14,
    fontWeight: "700",
  },
  publicCurrentUserText: {
    color: "#F7FAFF",
  },
  publicAmount: {
    color: "#4AE39A",
    fontSize: 14,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(3, 10, 20, 0.58)",
  },
  modalBackdrop: {
    flex: 1,
  },
  confirmSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#101A31",
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 18,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 88,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#344562",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1C2A45",
  },
  sheetTitle: {
    color: "#F7FAFF",
    fontSize: 22,
    fontWeight: "800",
  },
  helpBadge: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: "#A9B8D6",
    alignItems: "center",
    justifyContent: "center",
  },
  helpBadgeText: {
    color: "#0E1B36",
    fontSize: 22,
    fontWeight: "800",
  },
  confirmMatchCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#314765",
    backgroundColor: "#16233F",
    padding: 18,
    gap: 16,
  },
  confirmMatchBody: {
    flex: 1,
    gap: 8,
  },
  confirmEyebrow: {
    color: "#2463EB",
    fontSize: 15,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  confirmMatchTitle: {
    color: "#F7FAFF",
    fontSize: 26,
    fontWeight: "800",
  },
  confirmMatchMeta: {
    color: "#94A4C0",
    fontSize: 15,
    fontWeight: "600",
  },
  confirmBadge: {
    minWidth: 112,
    borderRadius: 14,
    backgroundColor: "#0F2B66",
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBadgeText: {
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "800",
  },
  confirmDetails: {
    gap: 18,
    paddingVertical: 6,
  },
  confirmRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  confirmLabel: {
    color: "#9FB0CF",
    fontSize: 16,
    fontWeight: "600",
  },
  confirmValue: {
    color: "#F7FAFF",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "right",
  },
  confirmValueWrap: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
  confirmValueAccent: {
    color: "#2463EB",
    fontSize: 17,
    fontWeight: "800",
  },
  confirmDivider: {
    height: 1,
    backgroundColor: "#243451",
  },
  confirmButton: {
    height: 60,
    borderRadius: 18,
    backgroundColor: "#2463EB",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmButtonText: {
    color: "#F7FAFF",
    fontSize: 18,
    fontWeight: "800",
  },
  cancelButton: {
    height: 60,
    borderRadius: 18,
    backgroundColor: "#1B2740",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    color: "#D7E1F5",
    fontSize: 17,
    fontWeight: "700",
  },
  toastWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    alignItems: "center",
  },
  toastNoPointerEvents: {
    pointerEvents: "none",
  },
  toastCard: {
    maxWidth: 420,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#7A5A1A",
    backgroundColor: "#2E2210",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toastText: {
    color: "#F6D6A0",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    fontWeight: "600",
  },
});
