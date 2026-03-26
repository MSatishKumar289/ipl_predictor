import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { db } from "./firebase";

export type BroadcastNotificationType = "important_update" | "maintenance_notice";

export async function queueBroadcastNotification({
  type,
  message,
  createdBy,
}: {
  type: BroadcastNotificationType;
  message: string;
  createdBy: string;
}) {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    throw new Error("Enter a message before sending the notification.");
  }

  await addDoc(collection(db, "broadcastNotifications"), {
    type,
    message: trimmedMessage,
    audience: "all_users",
    status: "queued",
    createdBy,
    createdAt: serverTimestamp(),
    sentAt: null,
  });
}
