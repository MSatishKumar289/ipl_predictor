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

const VENUE_SOURCE_PATH = path.join(process.cwd(), "data", "ipl-2026-venues.json");

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

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeVenue(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeStartAt(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function loadVenueSource() {
  if (!fs.existsSync(VENUE_SOURCE_PATH)) {
    throw new Error(
      `Venue source file not found at ${VENUE_SOURCE_PATH}. Create it before running the dry run.`
    );
  }

  const raw = fs.readFileSync(VENUE_SOURCE_PATH, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error("Venue source file is empty or invalid.");
  }

  const venueMap = new Map();
  const duplicateMatchNumbers = new Set();

  for (const entry of parsed) {
    const matchNumber = Number(entry.matchNumber);
    const venue = normalizeVenue(entry.venue);

    if (!Number.isInteger(matchNumber) || matchNumber <= 0) {
      throw new Error(`Invalid matchNumber in venue source: ${JSON.stringify(entry)}`);
    }

    if (!venue) {
      throw new Error(`Missing venue for match ${matchNumber}.`);
    }

    if (venueMap.has(matchNumber)) {
      duplicateMatchNumbers.add(matchNumber);
    }

    venueMap.set(matchNumber, {
      matchNumber,
      teamAName: entry.teamAName ?? null,
      teamBName: entry.teamBName ?? null,
      teamAShort: entry.teamAShort ?? null,
      teamBShort: entry.teamBShort ?? null,
      startAt: entry.startAt ?? null,
      venue,
    });
  }

  if (duplicateMatchNumbers.size) {
    throw new Error(
      `Duplicate match numbers in venue source: ${[...duplicateMatchNumbers].sort((a, b) => a - b).join(", ")}`
    );
  }

  return venueMap;
}

function compareTeams(dbMatch, sourceMatch) {
  const checks = [
    ["teamAName", dbMatch.teamAName, sourceMatch.teamAName],
    ["teamBName", dbMatch.teamBName, sourceMatch.teamBName],
    ["teamAShort", dbMatch.teamAShort, sourceMatch.teamAShort],
    ["teamBShort", dbMatch.teamBShort, sourceMatch.teamBShort],
  ];

  const mismatches = checks
    .filter(([, , sourceValue]) => sourceValue != null)
    .filter(([, dbValue, sourceValue]) => normalizeText(dbValue) !== normalizeText(sourceValue))
    .map(([field, dbValue, sourceValue]) => ({
      field,
      dbValue: dbValue ?? null,
      sourceValue,
    }));

  return mismatches;
}

function compareStartAt(dbMatch, sourceMatch) {
  if (!sourceMatch.startAt) {
    return null;
  }

  const normalizedDbStartAt = normalizeStartAt(dbMatch.startAt);
  const normalizedSourceStartAt = normalizeStartAt(sourceMatch.startAt);

  if (!normalizedSourceStartAt) {
    return {
      field: "startAt",
      dbValue: dbMatch.startAt ?? null,
      sourceValue: sourceMatch.startAt,
    };
  }

  if (normalizedDbStartAt !== normalizedSourceStartAt) {
    return {
      field: "startAt",
      dbValue: normalizedDbStartAt,
      sourceValue: normalizedSourceStartAt,
    };
  }

  return null;
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

  const venueMap = loadVenueSource();
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

  const matchesSnapshot = await getDocs(query(collection(db, "matches")));
  const updates = [];
  const alreadyCorrect = [];
  const missingInSource = [];
  const mismatches = [];
  const seenMatchNumbers = new Set();

  for (const matchSnapshot of matchesSnapshot.docs) {
    const match = matchSnapshot.data();
    const matchNumber = Number(match.matchNumber);
    seenMatchNumbers.add(matchNumber);

    const sourceMatch = venueMap.get(matchNumber);
    if (!sourceMatch) {
      missingInSource.push({
        id: matchSnapshot.id,
        matchNumber,
        teams: `${match.teamAShort} vs ${match.teamBShort}`,
      });
      continue;
    }

    const teamMismatches = compareTeams(match, sourceMatch);
    const startAtMismatch = compareStartAt(match, sourceMatch);

    if (teamMismatches.length || startAtMismatch) {
      mismatches.push({
        id: matchSnapshot.id,
        matchNumber,
        teams: `${match.teamAShort} vs ${match.teamBShort}`,
        issues: [...teamMismatches, ...(startAtMismatch ? [startAtMismatch] : [])],
      });
      continue;
    }

    const currentVenue = normalizeVenue(match.venue);
    if (currentVenue === sourceMatch.venue) {
      alreadyCorrect.push({
        id: matchSnapshot.id,
        matchNumber,
        venue: currentVenue || null,
      });
      continue;
    }

    updates.push({
      ref: matchSnapshot.ref,
      id: matchSnapshot.id,
      matchNumber,
      teams: `${match.teamAShort} vs ${match.teamBShort}`,
      currentVenue: currentVenue || null,
      nextVenue: sourceMatch.venue,
    });
  }

  const missingInDb = [...venueMap.keys()]
    .filter((matchNumber) => !seenMatchNumbers.has(matchNumber))
    .sort((a, b) => a - b)
    .map((matchNumber) => {
      const sourceMatch = venueMap.get(matchNumber);
      return {
        matchNumber,
        venue: sourceMatch?.venue ?? null,
      };
    });

  console.log(
    JSON.stringify(
      {
        mode: shouldApply ? "apply" : "dry-run",
        totalMatches: matchesSnapshot.size,
        totalVenueRows: venueMap.size,
        updatesPlanned: updates.length,
        alreadyCorrect: alreadyCorrect.length,
        missingInSource: missingInSource.length,
        missingInDb: missingInDb.length,
        mismatches: mismatches.length,
        sampleUpdates: updates.slice(0, 10).map(({ ref, ...entry }) => entry),
        sampleAlreadyCorrect: alreadyCorrect.slice(0, 10),
        sampleMissingInSource: missingInSource.slice(0, 10),
        sampleMissingInDb: missingInDb.slice(0, 10),
        sampleMismatches: mismatches.slice(0, 10),
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

  if (mismatches.length || missingInSource.length || missingInDb.length) {
    throw new Error("Refusing to apply venue updates while mismatches or missing rows exist.");
  }

  for (const batchItems of chunk(updates, 400)) {
    const batch = writeBatch(db);

    for (const updateEntry of batchItems) {
      batch.update(updateEntry.ref, {
        venue: updateEntry.nextVenue,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  }

  console.log(`Updated ${updates.length} match documents with venue details.`);
  await signOut(auth);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
