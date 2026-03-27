import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuth, initializeAuth, type Auth, type Persistence } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { Platform } from "react-native";

const firebaseEnv = {
  EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const missingFirebaseEnv = Object.entries(firebaseEnv)
  .filter(([, value]) => !value)
  .map(([name]) => name);

export const firebaseInitializationError = missingFirebaseEnv.length
  ? `Missing Firebase environment variables: ${missingFirebaseEnv.join(", ")}`
  : null;

let firebaseAppValue: FirebaseApp | undefined;

function initializeFirebaseAuth() {
  if (!firebaseAppValue) {
    return null;
  }

  if (Platform.OS === "web") {
    return getAuth(firebaseAppValue);
  }

  const reactNativeAuth = require("firebase/auth") as {
    getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
  };

  try {
    return initializeAuth(firebaseAppValue, {
      persistence: reactNativeAuth.getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(firebaseAppValue);
  }
}

let authValue: Auth | undefined;
let dbValue: Firestore | undefined;

if (!firebaseInitializationError) {
  const firebaseConfig = {
    apiKey: firebaseEnv.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: firebaseEnv.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: firebaseEnv.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: firebaseEnv.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: firebaseEnv.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: firebaseEnv.EXPO_PUBLIC_FIREBASE_APP_ID,
  };

  firebaseAppValue = getApps().length ? getApp() : initializeApp(firebaseConfig);
  authValue = initializeFirebaseAuth() ?? undefined;
  dbValue = getFirestore(firebaseAppValue);
}

export const firebaseApp = firebaseAppValue as FirebaseApp;
export const auth = authValue as Auth;
export const db = dbValue as Firestore;

export function getFirebaseServices() {
  if (!firebaseAppValue || !authValue || !dbValue) {
    throw new Error(
      firebaseInitializationError ??
        "Firebase failed to initialize. Check the configured environment variables."
    );
  }

  return { auth: authValue, db: dbValue, firebaseApp: firebaseAppValue };
}
