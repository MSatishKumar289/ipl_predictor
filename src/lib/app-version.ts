import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export type RemoteAppVersionConfig = {
  latestVersion: string;
  minRequiredVersion?: string;
  message?: string;
  updatedAt?: string;
};

export type AppVersionStatus = "none" | "soft" | "force";

export type AppVersionCheckResult = {
  status: AppVersionStatus;
  currentVersion: string;
  remote: RemoteAppVersionConfig;
};

type CachedRemoteVersion = {
  fetchedAt: number;
  remote: RemoteAppVersionConfig;
};

const REMOTE_VERSION_CACHE_KEY = "cache:web_app_version:v1";
const SOFT_DISMISS_CACHE_KEY = "cache:web_app_version_soft_dismiss:v1";
const REMOTE_VERSION_TTL_MS = 5 * 60 * 1000;
const SOFT_DISMISS_TTL_MS = 12 * 60 * 60 * 1000;
const VERSION_CONFIG_URL = "/app-version.json";
const FALLBACK_VERSION = "1.0.0";

export const CURRENT_APP_VERSION =
  process.env.EXPO_PUBLIC_APP_VERSION ||
  process.env.EXPO_PUBLIC_APP_BUILD_VERSION ||
  FALLBACK_VERSION;

function parseVersion(version: string) {
  return version
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((value) => (Number.isFinite(value) ? value : 0));
}

function compareSemver(left: string, right: string) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const a = leftParts[index] ?? 0;
    const b = rightParts[index] ?? 0;

    if (a > b) {
      return 1;
    }

    if (a < b) {
      return -1;
    }
  }

  return 0;
}

function isRemotePayload(value: unknown): value is RemoteAppVersionConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RemoteAppVersionConfig>;
  return typeof candidate.latestVersion === "string" && candidate.latestVersion.trim().length > 0;
}

async function getCachedRemoteVersion(nowMs: number) {
  const raw = await AsyncStorage.getItem(REMOTE_VERSION_CACHE_KEY);
  if (!raw) {
    return null;
  }

  const parsed = JSON.parse(raw) as CachedRemoteVersion;
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  if (
    typeof parsed.fetchedAt !== "number" ||
    nowMs - parsed.fetchedAt > REMOTE_VERSION_TTL_MS ||
    !isRemotePayload(parsed.remote)
  ) {
    return null;
  }

  return parsed.remote;
}

async function fetchRemoteVersionConfig(nowMs: number) {
  const response = await fetch(VERSION_CONFIG_URL);
  if (!response.ok) {
    throw new Error(`Version fetch failed: ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  if (!isRemotePayload(payload)) {
    throw new Error("Invalid app version payload.");
  }

  const remote: RemoteAppVersionConfig = {
    latestVersion: payload.latestVersion.trim(),
    minRequiredVersion: payload.minRequiredVersion?.trim() || undefined,
    message: payload.message?.trim() || undefined,
    updatedAt: payload.updatedAt?.trim() || undefined,
  };

  const cachePayload: CachedRemoteVersion = {
    fetchedAt: nowMs,
    remote,
  };

  await AsyncStorage.setItem(REMOTE_VERSION_CACHE_KEY, JSON.stringify(cachePayload));
  return remote;
}

async function isSoftDismissed(latestVersion: string, nowMs: number) {
  const raw = await AsyncStorage.getItem(SOFT_DISMISS_CACHE_KEY);
  if (!raw) {
    return false;
  }

  const parsed = JSON.parse(raw) as { version?: string; dismissedAt?: number };
  if (!parsed || parsed.version !== latestVersion || typeof parsed.dismissedAt !== "number") {
    return false;
  }

  return nowMs - parsed.dismissedAt <= SOFT_DISMISS_TTL_MS;
}

export async function dismissSoftVersionNotice(latestVersion: string) {
  const payload = {
    version: latestVersion,
    dismissedAt: Date.now(),
  };

  await AsyncStorage.setItem(SOFT_DISMISS_CACHE_KEY, JSON.stringify(payload));
}

export async function checkWebAppVersion(): Promise<AppVersionCheckResult | null> {
  if (Platform.OS !== "web") {
    return null;
  }

  const nowMs = Date.now();
  const cached = await getCachedRemoteVersion(nowMs);
  const remote = cached ?? (await fetchRemoteVersionConfig(nowMs));
  const minRequiredVersion = remote.minRequiredVersion || remote.latestVersion;

  if (compareSemver(CURRENT_APP_VERSION, minRequiredVersion) < 0) {
    return {
      status: "force",
      currentVersion: CURRENT_APP_VERSION,
      remote,
    };
  }

  if (compareSemver(CURRENT_APP_VERSION, remote.latestVersion) < 0) {
    const dismissed = await isSoftDismissed(remote.latestVersion, nowMs);
    return {
      status: dismissed ? "none" : "soft",
      currentVersion: CURRENT_APP_VERSION,
      remote,
    };
  }

  return {
    status: "none",
    currentVersion: CURRENT_APP_VERSION,
    remote,
  };
}
