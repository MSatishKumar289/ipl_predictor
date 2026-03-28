const fs = require("fs");
const path = require("path");
const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword, signOut } = require("firebase/auth");
const {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  writeBatch,
} = require("firebase/firestore");

const MATCH_LOCK_MINUTES = 35;
const TERMINAL_STATUSES = new Set(["locked", "completed", "settled", "no_result"]);

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function formatDateTime(value) {
  return new Date(value).toISOString();
}

function isValidDate(value) {
  return !Number.isNaN(new Date(value).getTime());
}

function getNextLockAt(startAt) {
  const startAtDate = new Date(startAt);
  return new Date(startAtDate.getTime() - MATCH_LOCK_MINUTES * 60 * 1000).toISOString();
}

function shouldSkipMatch(match, nowIso) {
  if (!match.startAt || !match.lockAt) {
    return { skip: true, reason: "missing_dates" };
  }

  if (!isValidDate(match.startAt) || !isValidDate(match.lockAt)) {
    return { skip: true, reason: "invalid_dates" };
  }

  if (TERMINAL_STATUSES.has(String(match.status))) {
    return { skip: true, reason: `terminal_status:${match.status}` };
  }

  if (new Date(match.lockAt).toISOString() <= nowIso) {
    return { skip: true, reason: "already_locked_by_time" };
  }

  return { skip: false, reason: null };
}

async function main() {
  loadEnvFile();

  const shouldApply = hasFlag("apply");
  const adminEmail = readArg("admin-email") || process.env.IMPORT_ADMIN_EMAIL;
  const adminPassword = readArg("admin-password") || process.env.IMPORT_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error(
      "Provide admin credentials with --admin-email=... --admin-password=... or set IMPORT_ADMIN_EMAIL and IMPORT_ADMIN_PASSWORD."
    );
  }

  const app = initializeApp({
    apiKey: getRequiredEnv("EXPO_PUBLIC_FIREBASE_API_KEY"),
    authDomain: getRequiredEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: getRequiredEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: getRequiredEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: getRequiredEnv("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: getRequiredEnv("EXPO_PUBLIC_FIREBASE_APP_ID"),
  });
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log("Signing in as admin...");
  const credential = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
  const adminUid = credential.user.uid;
  const adminProfileSnapshot = await getDoc(doc(db, "users", adminUid));
  const adminProfile = adminProfileSnapshot.exists() ? adminProfileSnapshot.data() : null;

  if (adminProfile?.role !== "admin") {
    throw new Error("The provided account is not an admin user.");
  }

  const nowIso = new Date().toISOString();
  const matchesSnapshot = await getDocs(query(collection(db, "matches")));
  const updates = [];
  const skipped = [];

  for (const matchSnapshot of matchesSnapshot.docs) {
    const match = matchSnapshot.data();
    const skipState = shouldSkipMatch(match, nowIso);

    if (skipState.skip) {
      skipped.push({
        id: matchSnapshot.id,
        matchNumber: match.matchNumber ?? null,
        reason: skipState.reason,
      });
      continue;
    }

    const nextLockAt = getNextLockAt(match.startAt);
    if (nextLockAt === match.lockAt) {
      skipped.push({
        id: matchSnapshot.id,
        matchNumber: match.matchNumber ?? null,
        reason: "already_updated",
      });
      continue;
    }

    updates.push({
      ref: matchSnapshot.ref,
      id: matchSnapshot.id,
      matchNumber: match.matchNumber ?? null,
      startAt: formatDateTime(match.startAt),
      previousLockAt: formatDateTime(match.lockAt),
      nextLockAt,
      status: match.status ?? null,
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: shouldApply ? "apply" : "dry-run",
        targetLockMinutes: MATCH_LOCK_MINUTES,
        totalMatches: matchesSnapshot.size,
        updatesPlanned: updates.length,
        skipped: skipped.length,
        sampleUpdates: updates.slice(0, 10).map(({ ref, ...entry }) => entry),
        sampleSkipped: skipped.slice(0, 10),
      },
      null,
      2
    )
  );

  if (!shouldApply) {
    console.log("Dry run only. Re-run with --apply to write updates.");
    await signOut(auth);
    return;
  }

  for (const batchItems of chunk(updates, 400)) {
    const batch = writeBatch(db);

    for (const updateEntry of batchItems) {
      batch.update(updateEntry.ref, {
        lockAt: updateEntry.nextLockAt,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  }

  console.log(`Updated ${updates.length} match documents.`);
  await signOut(auth);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
