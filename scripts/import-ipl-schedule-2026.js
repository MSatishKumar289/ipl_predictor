const fs = require("fs");
const path = require("path");
const { initializeApp } = require("firebase/app");
const {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} = require("firebase/auth");
const {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} = require("firebase/firestore");

const MATCH_LOCK_MINUTES = 35;
const SIGNUP_BONUS = 50000;
const IN_QUERY_CHUNK = 10;

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

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function deleteSnapshots(snapshots) {
  for (const snapshot of snapshots) {
    if (snapshot.empty) {
      continue;
    }

    const batch = writeBatch(snapshot.query.firestore);
    snapshot.docs.forEach((entry) => batch.delete(entry.ref));
    await batch.commit();
  }
}

async function deleteOldPredictions(db, matchIds) {
  const predictionSnapshots = [];

  for (const ids of chunk(matchIds, IN_QUERY_CHUNK)) {
    const predictionsQuery = query(
      collection(db, "predictions"),
      where("matchId", "in", ids),
    );
    predictionSnapshots.push(await getDocs(predictionsQuery));
  }

  const count = predictionSnapshots.reduce(
    (sum, snapshot) => sum + snapshot.size,
    0,
  );
  await deleteSnapshots(predictionSnapshots);
  return count;
}

async function deleteOldTransactions(db, matchIds) {
  const transactionSnapshots = [];

  for (const ids of chunk(matchIds, IN_QUERY_CHUNK)) {
    const transactionsQuery = query(
      collection(db, "transactions"),
      where("referenceType", "==", "match"),
      where("referenceId", "in", ids),
    );
    transactionSnapshots.push(await getDocs(transactionsQuery));
  }

  const count = transactionSnapshots.reduce(
    (sum, snapshot) => sum + snapshot.size,
    0,
  );
  await deleteSnapshots(transactionSnapshots);
  return count;
}

async function deleteOldMatches(db, matchIds) {
  for (const matchId of matchIds) {
    await deleteDoc(doc(db, "matches", matchId));
  }
  return matchIds.length;
}

async function resetNonAdminUsers(db) {
  const usersSnapshot = await getDocs(
    query(collection(db, "users"), orderBy("createdAt")),
  );
  let updatedUsers = 0;

  for (const userSnapshot of usersSnapshot.docs) {
    const profile = userSnapshot.data();
    if (profile.role === "admin") {
      continue;
    }

    await updateDoc(userSnapshot.ref, {
      balance: SIGNUP_BONUS,
      points: 0,
      wins: 0,
      losses: 0,
      totalPredictions: 0,
      updatedAt: serverTimestamp(),
    });
    updatedUsers += 1;
  }

  return updatedUsers;
}

function loadSchedule() {
  const filePath = path.join(process.cwd(), "data", "ipl-2026-fixtures.json");

  if (!fs.existsSync(filePath)) {
    throw new Error(`Fixture file not found at ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const fixtures = JSON.parse(raw);

  if (!Array.isArray(fixtures) || !fixtures.length) {
    throw new Error("Fixture file is empty or invalid.");
  }

  return fixtures;
}

function buildMatchPayload() {
  const fixtures = loadSchedule();

  return fixtures.map((fixture) => {
    const startAt = new Date(fixture.startAt);
    const lockAt = new Date(startAt.getTime() - MATCH_LOCK_MINUTES * 60 * 1000);

    return {
      id: `match-2026-${String(fixture.matchNumber).padStart(2, "0")}`,
      matchNumber: fixture.matchNumber,
      teamAName: fixture.teamAName,
      teamBName: fixture.teamBName,
      teamAShort: fixture.teamAShort,
      teamBShort: fixture.teamBShort,
      startAt: startAt.toISOString(),
      lockAt: lockAt.toISOString(),
      status: "upcoming",
      winner: null,
      isEditableBeforeLock: fixture.isEditableBeforeLock !== false,
      settledAt: null,
      settledBy: null,
    };
  });
}

async function createMatches(db, createdBy) {
  const matches = buildMatchPayload();
  const batches = chunk(matches, 200);

  for (const batchMatches of batches) {
    const batch = writeBatch(db);

    for (const match of batchMatches) {
      const matchRef = doc(db, "matches", match.id);
      batch.set(matchRef, {
        matchNumber: match.matchNumber,
        teamAName: match.teamAName,
        teamBName: match.teamBName,
        teamAShort: match.teamAShort,
        teamBShort: match.teamBShort,
        startAt: match.startAt,
        lockAt: match.lockAt,
        status: match.status,
        winner: match.winner,
        isEditableBeforeLock: match.isEditableBeforeLock,
        createdBy,
        settledAt: match.settledAt,
        settledBy: match.settledBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  }

  return matches.length;
}

async function main() {
  loadEnvFile();

  const adminEmail = readArg("admin-email") || process.env.IMPORT_ADMIN_EMAIL;
  const adminPassword =
    readArg("admin-password") || process.env.IMPORT_ADMIN_PASSWORD;
  const shouldResetUsers = hasFlag("reset-users");

  if (!adminEmail || !adminPassword) {
    throw new Error(
      "Provide admin credentials with --admin-email=... --admin-password=... or set IMPORT_ADMIN_EMAIL and IMPORT_ADMIN_PASSWORD.",
    );
  }

  const app = initializeApp({
    apiKey: getRequiredEnv("EXPO_PUBLIC_FIREBASE_API_KEY"),
    authDomain: getRequiredEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: getRequiredEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: getRequiredEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: getRequiredEnv(
      "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    ),
    appId: getRequiredEnv("EXPO_PUBLIC_FIREBASE_APP_ID"),
  });

  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log("Signing in as admin...");
  const credential = await signInWithEmailAndPassword(
    auth,
    adminEmail,
    adminPassword,
  );
  const adminUid = credential.user.uid;

  const adminProfileSnapshot = await getDoc(doc(db, "users", adminUid));
  const adminProfile = adminProfileSnapshot.exists()
    ? adminProfileSnapshot.data()
    : null;

  if (adminProfile?.role !== "admin") {
    throw new Error("The provided account is not an admin user.");
  }

  console.log("Reading existing matches...");
  const existingMatchesSnapshot = await getDocs(
    query(collection(db, "matches")),
  );
  const oldMatchIds = existingMatchesSnapshot.docs.map((entry) => entry.id);

  let deletedPredictions = 0;
  let deletedTransactions = 0;
  let deletedMatches = 0;

  if (oldMatchIds.length) {
    console.log(
      `Deleting ${oldMatchIds.length} existing matches and related data...`,
    );
    deletedPredictions = await deleteOldPredictions(db, oldMatchIds);
    deletedTransactions = await deleteOldTransactions(db, oldMatchIds);
    deletedMatches = await deleteOldMatches(db, oldMatchIds);
  }

  let resetUsers = 0;
  if (shouldResetUsers) {
    console.log("Resetting non-admin user balances and stats...");
    resetUsers = await resetNonAdminUsers(db);
  }

  console.log("Creating 2026 schedule...");
  const createdMatches = await createMatches(db, adminUid);

  await signOut(auth);

  console.log("Done.");
  console.log(
    JSON.stringify(
      {
        deletedMatches,
        deletedPredictions,
        deletedTransactions,
        resetUsers,
        createdMatches,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
