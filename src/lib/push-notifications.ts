import Constants from "expo-constants";
import * as Device from "expo-device";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { Platform } from "react-native";

import { db } from "./firebase";

type PushNavigationTarget = "match" | "my-bets" | "my-referrals" | "home";

type PushNotificationData = {
  target?: PushNavigationTarget;
  matchId?: string;
};

const ANDROID_CHANNEL_ID = "default";

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

function isNativePushPlatform() {
  return Platform.OS === "android" || Platform.OS === "ios";
}

function getExpoProjectId() {
  const easProjectId =
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;

  if (!easProjectId) {
    throw new Error("Expo project ID is missing. Check app configuration.");
  }

  return easProjectId;
}

function deviceDocIdFromToken(token: string) {
  return token.replace(/[^\w.-]/g, "_");
}

async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Default",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function registerCurrentDeviceForPushNotifications(userId: string) {
  if (!isNativePushPlatform() || !Device.isDevice) {
    return null;
  }

  await ensureAndroidNotificationChannel();

  const currentPermissions = await Notifications.getPermissionsAsync();
  let finalStatus = currentPermissions.status;

  if (finalStatus !== "granted") {
    const nextPermissions = await Notifications.requestPermissionsAsync();
    finalStatus = nextPermissions.status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  const token = (
    await Notifications.getExpoPushTokenAsync({
      projectId: getExpoProjectId(),
    })
  ).data;

  await setDoc(
    doc(collection(db, "users", userId, "devices"), deviceDocIdFromToken(token)),
    {
      provider: "expo",
      expoPushToken: token,
      platform: Platform.OS,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  return token;
}

export async function unregisterCurrentDevicePushToken(userId: string, token: string | null) {
  if (!isNativePushPlatform() || !token) {
    return;
  }

  await deleteDoc(doc(collection(db, "users", userId, "devices"), deviceDocIdFromToken(token)));
}

export async function updateUserNotificationPreference(userId: string, enabled: boolean) {
  await updateDoc(doc(db, "users", userId), {
    notificationsEnabled: enabled,
    updatedAt: serverTimestamp(),
  });
}

function normalizePushNotificationData(data: unknown): PushNotificationData | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const candidate = data as Record<string, unknown>;
  const target =
    candidate.target === "match" ||
    candidate.target === "my-bets" ||
    candidate.target === "my-referrals" ||
    candidate.target === "home"
      ? candidate.target
      : undefined;
  const matchId = typeof candidate.matchId === "string" ? candidate.matchId : undefined;

  if (!target) {
    return null;
  }

  return {
    target,
    matchId,
  };
}

export function navigateFromPushNotification(data: unknown) {
  const normalized = normalizePushNotificationData(data);

  if (!normalized) {
    return;
  }

  switch (normalized.target) {
    case "match":
      if (normalized.matchId) {
        router.push({
          pathname: "/match/[id]",
          params: { id: normalized.matchId },
        });
      }
      return;
    case "my-bets":
      router.push("/(tabs)/my-bets");
      return;
    case "my-referrals":
      router.push("/my-referrals");
      return;
    case "home":
      router.push("/(tabs)/home");
      return;
    default:
      return;
  }
}

export async function handleInitialPushNotificationResponse(
  hasHandledResponse: (identifier: string) => boolean,
  markResponseHandled: (identifier: string) => void
) {
  if (!isNativePushPlatform()) {
    return;
  }

  const response = await Notifications.getLastNotificationResponseAsync();

  if (!response) {
    return;
  }

  const identifier = response.notification.request.identifier;

  if (hasHandledResponse(identifier)) {
    return;
  }

  markResponseHandled(identifier);
  navigateFromPushNotification(response.notification.request.content.data);
}

export function addPushNotificationResponseListener(
  hasHandledResponse: (identifier: string) => boolean,
  markResponseHandled: (identifier: string) => void
) {
  if (!isNativePushPlatform()) {
    return () => {};
  }

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const identifier = response.notification.request.identifier;

    if (hasHandledResponse(identifier)) {
      return;
    }

    markResponseHandled(identifier);
    navigateFromPushNotification(response.notification.request.content.data);
  });

  return () => {
    subscription.remove();
  };
}
