import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Asset } from "expo-asset";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { SvgUri } from "react-native-svg";

import { AppScreenBackground } from "@/components/AppScreenBackground";
import { BackButton } from "@/components/BackButton";
import { StickyHeaderBar } from "@/components/StickyHeaderBar";
import {
  getNextScheduledWeeklySpinCampaign,
  getWeeklySpinStatus,
  spinWeeklyWheel,
  WEEKLY_SPIN_SEGMENTS,
} from "@/lib/spin";
import type { WeeklySpinCampaignRecord, WeeklySpinResultRecord } from "@/lib/spin-types";
import { useAuth } from "@/providers/AuthProvider";

const WHEEL_BASE_SIZE = 330;
const CENTER_BASE_SIZE = 92;

const WHEEL_IMAGE = require("../../assets/images/wheel/weekly-wheel-base.svg");
const SPIN_IMAGE = require("../../assets/images/wheel/weekly-wheel-spin-icon.svg");

function blurActiveElementOnWeb() {
  if (typeof document === "undefined") {
    return;
  }

  const active = document.activeElement;
  if (active && "blur" in active && typeof active.blur === "function") {
    active.blur();
  }
}

export default function WeeklySpinScreen() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const rotation = useRef(new Animated.Value(0)).current;
  const totalRotation = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSpinning, setIsSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("");
  const [result, setResult] = useState<WeeklySpinResultRecord | null>(null);
  const [hasUsedSpin, setHasUsedSpin] = useState(false);
  const [nextCampaign, setNextCampaign] = useState<WeeklySpinCampaignRecord | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [wheelSvgUri, setWheelSvgUri] = useState<string | null>(null);
  const [spinSvgUri, setSpinSvgUri] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function resolveSvgAssets() {
      try {
        const wheelAsset = Asset.fromModule(WHEEL_IMAGE);
        const spinAsset = Asset.fromModule(SPIN_IMAGE);

        if (!wheelAsset.localUri) {
          await wheelAsset.downloadAsync();
        }
        if (!spinAsset.localUri) {
          await spinAsset.downloadAsync();
        }

        if (!isActive) {
          return;
        }

        setWheelSvgUri(wheelAsset.localUri ?? wheelAsset.uri);
        setSpinSvgUri(spinAsset.localUri ?? spinAsset.uri);
      } catch (assetError) {
        if (!isActive) {
          return;
        }
        setError(assetError instanceof Error ? assetError.message : "Unable to load wheel assets.");
      }
    }

    void resolveSvgAssets();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!user) {
      router.replace("/");
      return () => {
        isActive = false;
      };
    }

    void getWeeklySpinStatus(user.uid)
      .then((status) => {
        if (!isActive) {
          return;
        }

        if (!status.eligible && !status.result) {
          blurActiveElementOnWeb();
          router.replace("/(tabs)/home");
          return;
        }

        setStatusText(
          `Played ${status.playedCompletedMatches} of ${status.totalCompletedMatches} completed matches`
        );
        setResult(status.result);
        setHasUsedSpin(status.hasUsedSpin);

        if (status.hasUsedSpin) {
          void getNextScheduledWeeklySpinCampaign()
            .then((campaign) => {
              if (!isActive) {
                return;
              }
              setNextCampaign(campaign);
            })
            .catch(() => {
              if (!isActive) {
                return;
              }
              setNextCampaign(null);
            });
        } else {
          setNextCampaign(null);
        }
      })
      .catch((nextError) => {
        if (!isActive) {
          return;
        }

        setError(nextError instanceof Error ? nextError.message : "Unable to load weekly spin.");
      })
      .finally(() => {
        if (!isActive) {
          return;
        }
        setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [user]);

  useEffect(() => {
    if (!hasUsedSpin || !nextCampaign) {
      return;
    }

    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [hasUsedSpin, nextCampaign]);

  const segmentAngle = useMemo(() => 360 / WEEKLY_SPIN_SEGMENTS.length, []);
  const wheelSize = Math.max(260, Math.min(WHEEL_BASE_SIZE, width - 28));
  const centerSize = Math.max(72, Math.min(CENTER_BASE_SIZE, wheelSize * 0.28));

  const wheelRotation = rotation.interpolate({
    inputRange: [0, 360],
    outputRange: ["0deg", "360deg"],
  });
  const nextCampaignStartMs = nextCampaign ? Date.parse(nextCampaign.startAt) : 0;
  const countdownSeconds = nextCampaign
    ? Math.max(0, Math.floor((nextCampaignStartMs - nowMs) / 1000))
    : 0;

  async function handleSpin() {
    if (!user || isSpinning || !!result) {
      return;
    }

    try {
      setError(null);
      setIsSpinning(true);
      const nextResult = (await spinWeeklyWheel(user.uid)).result;

      if (!nextResult) {
        throw new Error("Spin result missing.");
      }

      const targetOffset = (360 - ((nextResult.segmentIndex + 0.5) * segmentAngle) % 360) % 360;
      const currentMod = ((totalRotation.current % 360) + 360) % 360;
      const clockwiseDelta = (targetOffset - currentMod + 360) % 360;
      const landingRotation = totalRotation.current + 360 * 6 + clockwiseDelta;

      Animated.timing(rotation, {
        toValue: landingRotation,
        duration: 4600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        totalRotation.current = landingRotation;
        setResult(nextResult);
        setIsSpinning(false);
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to complete the spin.");
      setIsSpinning(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.screen}>
        <AppScreenBackground />
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#F2F2F2" />
          <Text style={styles.loadingText}>Loading weekly spin...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <AppScreenBackground />
      <View style={styles.topBannerWrap}>
        <StickyHeaderBar
          title="Weekly Spin"
          leftSlot={<BackButton fallbackHref="/(tabs)/home" />}
          rightSlot={<View style={styles.headerSpacer} />}
          edgeToEdge
        />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pageShell}>
          <Text style={styles.title}>Spin The Wheel</Text>
          {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}

          <View style={styles.wheelPanel}>
            <Animated.View
              style={[
                styles.rotatingWheelWrap,
                {
                  width: wheelSize,
                  height: wheelSize,
                  transform: [{ rotate: wheelRotation }],
                },
              ]}
            >
              {wheelSvgUri ? (
                <SvgUri width="100%" height="100%" uri={wheelSvgUri} />
              ) : (
                <View style={styles.assetLoadingWrap}>
                  <ActivityIndicator size="small" color="#F2B84B" />
                </View>
              )}
            </Animated.View>

            <View style={styles.spinOverlay}>
              <Pressable
                style={[
                  styles.spinButton,
                  {
                    width: centerSize,
                    height: centerSize,
                    borderRadius: centerSize / 2,
                  },
                  isSpinning && styles.spinButtonDisabled,
                ]}
                onPress={() => void handleSpin()}
                disabled={isSpinning || !!result || !spinSvgUri}
              >
                {spinSvgUri ? (
                  <SvgUri width="100%" height="100%" uri={spinSvgUri} />
                ) : (
                  <ActivityIndicator size="small" color="#F2B84B" />
                )}
              </Pressable>
            </View>
          </View>

          {result ? (
            <View style={styles.resultCard}>
              <Text style={styles.resultEyebrow}>Result</Text>
              <Text style={styles.resultTitle}>{result.rewardLabel}</Text>
              <Text style={styles.resultText}>
                {result.rewardKind === "free_bet_ticket" || result.rewardKind === "bet_insurance"
                  ? "Reward added to Rewards. You can use it while placing a bet."
                  : result.rewardKind === "miss"
                    ? "No reward this time. You can spin again in the next weekly cycle."
                    : "Reward credited successfully."}
              </Text>
            </View>
          ) : (
            <Text style={styles.spinHint}>Tap the center spin icon.</Text>
          )}

          {hasUsedSpin && nextCampaign && countdownSeconds > 0 ? (
            <View style={styles.timelineCard}>
              <Text style={styles.timelineTitle}>Next Spin Window</Text>
              <Text style={styles.timelineText}>Starts: {formatDateTime(nextCampaign.startAt)}</Text>
              <Text style={styles.timelineText}>Ends: {formatDateTime(nextCampaign.endAt)}</Text>
              <Text style={styles.timelineCountdown}>
                Starts in {formatCountdown(countdownSeconds)}
              </Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              blurActiveElementOnWeb();
              router.replace("/(tabs)/home");
            }}
          >
            <Text style={styles.secondaryButtonText}>Back To Home</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function formatCountdown(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#091327",
  },
  topBannerWrap: {
    overflow: "hidden",
  },
  headerSpacer: {
    width: 42,
    height: 42,
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 40,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#F7FAFF",
    fontSize: 16,
    fontWeight: "600",
  },
  pageShell: {
    gap: 18,
    width: "100%",
    maxWidth: 960,
    alignSelf: "center",
  },
  title: {
    color: "#F7FAFF",
    fontSize: 30,
    fontWeight: "800",
    textAlign: "center",
  },
  statusText: {
    color: "#AFC0DE",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  wheelPanel: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    paddingTop: 6,
    paddingBottom: 6,
  },
  spinOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "box-none",
  },
  rotatingWheelWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  assetLoadingWrap: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  spinButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  spinButtonDisabled: {
    opacity: 0.85,
  },
  resultCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#355AA8",
    backgroundColor: "#102042",
    padding: 18,
    gap: 8,
  },
  resultEyebrow: {
    color: "#7FAAFF",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  resultTitle: {
    color: "#F7FAFF",
    fontSize: 20,
    fontWeight: "800",
  },
  resultText: {
    color: "#AFC0DE",
    fontSize: 14,
    lineHeight: 20,
  },
  timelineCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2A4A78",
    backgroundColor: "#0E2347",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 4,
  },
  timelineTitle: {
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "800",
  },
  timelineText: {
    color: "#AFC0DE",
    fontSize: 13,
    fontWeight: "600",
  },
  timelineCountdown: {
    color: "#66DDA1",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  spinHint: {
    color: "#B9CCEF",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  errorCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#7A2A2A",
    backgroundColor: "#311515",
    padding: 14,
  },
  errorText: {
    color: "#F0B3B3",
    fontSize: 14,
    lineHeight: 20,
  },
  secondaryButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: "#1B2740",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#D7E1F5",
    fontSize: 16,
    fontWeight: "700",
  },
});
