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
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
} = require("firebase/firestore");

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

function normalizePhoneNumber(phoneNumber) {
  return String(phoneNumber || "").replace(/[^0-9]/g, "");
}

async function main() {
  loadEnvFile();

  const firebaseConfig = {
    apiKey: getRequiredEnv("EXPO_PUBLIC_FIREBASE_API_KEY"),
    authDomain: getRequiredEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: getRequiredEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: getRequiredEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: getRequiredEnv("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: getRequiredEnv("EXPO_PUBLIC_FIREBASE_APP_ID"),
  };

  const adminEmail = getRequiredEnv("FIREBASE_ADMIN_EMAIL");
  const adminPassword = getRequiredEnv("FIREBASE_ADMIN_PASSWORD");

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const credential = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);

  try {
    const usersSnapshot = await getDocs(collection(db, "users"));
    let updatedCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      const user = userDoc.data();
      const phoneNumber = normalizePhoneNumber(user.phoneNumber);
      const authEmail = user.email;

      if (!phoneNumber || !authEmail) {
        continue;
      }

      await setDoc(
        doc(db, "login_index", phoneNumber),
        {
          userId: userDoc.id,
          phoneNumber,
          authEmail,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      updatedCount += 1;
    }

    console.log(`Backfilled ${updatedCount} phone login index records.`);
  } finally {
    await signOut(auth);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
