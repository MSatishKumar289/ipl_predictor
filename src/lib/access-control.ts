import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";

import { getFirebaseServices } from "./firebase";

type AccessControlSettings = {
  requireReferralForInstantAccess: boolean;
};

const settingsCollection = "app_settings";
const accessControlDocId = "access_control";

function accessControlDoc() {
  const { db } = getFirebaseServices();
  return doc(db, settingsCollection, accessControlDocId);
}

export function normalizeAccessControlSettings(
  value?: Partial<AccessControlSettings> | null
): AccessControlSettings {
  return {
    requireReferralForInstantAccess: value?.requireReferralForInstantAccess ?? true,
  };
}

export function subscribeToAccessControlSettings(
  callback: (settings: AccessControlSettings) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    accessControlDoc(),
    (snapshot) => {
      callback(normalizeAccessControlSettings(snapshot.exists() ? snapshot.data() : null));
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function updateAccessControlSettings(settings: Partial<AccessControlSettings>) {
  await setDoc(
    accessControlDoc(),
    {
      ...settings,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
