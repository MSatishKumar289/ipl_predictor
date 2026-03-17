import { initializeApp } from "firebase/app";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuth, initializeAuth, type Persistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { Platform } from "react-native";

function getEnv(name: keyof NodeJS.ProcessEnv) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing Firebase environment variable: ${name}`);
  }

  return value;
}

const firebaseConfig = {
  apiKey: getEnv("EXPO_PUBLIC_FIREBASE_API_KEY"),
  authDomain: getEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: getEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: getEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getEnv("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getEnv("EXPO_PUBLIC_FIREBASE_APP_ID"),
};

export const firebaseApp = initializeApp(firebaseConfig);
function initializeFirebaseAuth() {
  if (Platform.OS === "web") {
    return getAuth(firebaseApp);
  }

  const reactNativeAuth = require("firebase/auth") as {
    getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
  };

  return initializeAuth(firebaseApp, {
    persistence: reactNativeAuth.getReactNativePersistence(AsyncStorage),
  });
}

export const auth = initializeFirebaseAuth();

export const db = getFirestore(firebaseApp);
