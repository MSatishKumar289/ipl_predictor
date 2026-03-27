const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

exports.rejectPendingUser = onCall({ cors: true, region: "us-central1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const callerUid = request.auth.uid;
  const targetUserId = typeof request.data?.targetUserId === "string" ? request.data.targetUserId.trim() : "";

  if (!targetUserId) {
    throw new HttpsError("invalid-argument", "A target user id is required.");
  }

  const callerSnapshot = await db.doc(`users/${callerUid}`).get();
  if (!callerSnapshot.exists || callerSnapshot.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Only admins can reject users.");
  }

  const targetUserRef = db.doc(`users/${targetUserId}`);
  const targetUserSnapshot = await targetUserRef.get();
  if (!targetUserSnapshot.exists) {
    throw new HttpsError("not-found", "User not found.");
  }

  const targetUser = targetUserSnapshot.data() || {};
  if ((targetUser.accessStatus || "active") !== "pending_approval") {
    throw new HttpsError("failed-precondition", "Only pending users can be rejected.");
  }

  await auth.deleteUser(targetUserId);

  const cleanupRefs = [db.doc(`transactions/signup_bonus_${targetUserId}`)];

  await db.runTransaction(async (transaction) => {
    for (const ref of cleanupRefs) {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) {
        transaction.delete(ref);
      }
    }

    transaction.delete(targetUserRef);
  });

  return { ok: true };
});
