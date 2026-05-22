import AsyncStorage from "@react-native-async-storage/async-storage";

type ReadPolicyOptions = {
  key: string;
  minIntervalMs: number;
  nowMs?: number;
  activeHours?: {
    startHourInclusive: number;
    endHourInclusive: number;
  };
};

type ReadPolicyRecord = {
  lastReadAtMs: number;
};

function getHourInIndia(nowMs: number) {
  const value = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hour12: false,
  }).format(new Date(nowMs));
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : -1;
}

function isWithinActiveHours(nowMs: number, startHourInclusive: number, endHourInclusive: number) {
  const hour = getHourInIndia(nowMs);
  return hour >= startHourInclusive && hour <= endHourInclusive;
}

async function readPolicyRecord(key: string): Promise<ReadPolicyRecord | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ReadPolicyRecord;
    if (typeof parsed?.lastReadAtMs !== "number" || Number.isNaN(parsed.lastReadAtMs)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function shouldRunRead({
  key,
  minIntervalMs,
  nowMs = Date.now(),
  activeHours,
}: ReadPolicyOptions): Promise<boolean> {
  const record = await readPolicyRecord(key);
  if (!record) {
    return true;
  }

  if (activeHours) {
    const inWindow = isWithinActiveHours(
      nowMs,
      activeHours.startHourInclusive,
      activeHours.endHourInclusive
    );
    if (!inWindow) {
      return false;
    }
  }

  return nowMs - record.lastReadAtMs >= minIntervalMs;
}

export async function markReadRan(key: string, nowMs = Date.now()) {
  await AsyncStorage.setItem(
    key,
    JSON.stringify({
      lastReadAtMs: nowMs,
    } satisfies ReadPolicyRecord)
  );
}
