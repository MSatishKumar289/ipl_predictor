const { initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { logger } = require("firebase-functions");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");

initializeApp();
setGlobalOptions({ region: "asia-south1", maxInstances: 10 });

const db = getFirestore();
const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const EXPO_CHUNK_SIZE = 100;
const RECEIPT_CHUNK_SIZE = 100;
const STARTING_SOON_LEAD_MS = 30 * 60 * 1000;
const LOW_BALANCE_THRESHOLD = 5000;
const GENERIC_BALANCE_CREDIT_EXCLUDED_TYPES = new Set([
  "signup_bonus",
  "referral_bonus",
  "match_win_payout",
  "match_refund_no_result",
]);

function chunkItems(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function getMatchTitle(match) {
  return `${match.teamAShort} vs ${match.teamBShort} Match`;
}

async function getAllExpoDeviceTargets() {
  const usersSnapshot = await db.collection("users").get();
  const enabledUserIds = usersSnapshot.docs
    .filter((userDoc) => userDoc.get("notificationsEnabled") !== false)
    .map((userDoc) => userDoc.id);

  return getUsersExpoDeviceTargets(enabledUserIds);
}

async function getEnabledUserIds(userIds) {
  const enabledUserIds = [];

  for (const userId of [...new Set(userIds.filter(Boolean))]) {
    const userSnapshot = await db.collection("users").doc(userId).get();

    if (!userSnapshot.exists) {
      continue;
    }

    if (userSnapshot.get("notificationsEnabled") === false) {
      continue;
    }

    enabledUserIds.push(userId);
  }

  return enabledUserIds;
}

async function getUsersExpoDeviceTargets(userIds) {
  const uniqueUserIds = await getEnabledUserIds(userIds);
  const deviceTargets = [];

  for (const userId of uniqueUserIds) {
    const snapshot = await db
      .collection(`users/${userId}/devices`)
      .where("provider", "==", "expo")
      .get();

    deviceTargets.push(
      ...snapshot.docs
        .map((deviceDoc) => ({
          devicePath: deviceDoc.ref.path,
          userId,
          token: deviceDoc.get("expoPushToken"),
        }))
        .filter((entry) => typeof entry.token === "string")
    );
  }

  return deviceTargets;
}

async function persistPushTickets(messages, tickets) {
  const batch = db.batch();

  tickets.forEach((ticket, index) => {
    const message = messages[index];

    if (!message) {
      return;
    }

    if (ticket.status === "ok" && ticket.id) {
      const ticketRef = db.collection("pushTickets").doc();
      batch.set(ticketRef, {
        receiptId: ticket.id,
        userId: message.userId,
        devicePath: message.devicePath,
        expoPushToken: message.to,
        eventType: message.eventType,
        checkedAt: null,
        receiptStatus: "pending",
        receiptError: null,
        createdAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    if (ticket.details?.error === "DeviceNotRegistered" && message.devicePath) {
      batch.delete(db.doc(message.devicePath));
    }
  });

  await batch.commit();
}

async function sendExpoNotifications(messageTargets) {
  if (!messageTargets.length) {
    return;
  }

  const uniqueTargets = [];
  const seenTokens = new Set();

  for (const target of messageTargets) {
    if (seenTokens.has(target.to)) {
      continue;
    }

    seenTokens.add(target.to);
    uniqueTargets.push(target);
  }

  for (const chunk of chunkItems(uniqueTargets, EXPO_CHUNK_SIZE)) {
    const response = await fetch(EXPO_PUSH_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        chunk.map((message) => ({
          to: message.to,
          title: message.title,
          body: message.body,
          sound: "default",
          data: message.data,
        }))
      ),
    });

    const responseBody = await response.json();

    if (!response.ok) {
      logger.error("Expo push send request failed", {
        status: response.status,
        responseBody,
      });
      continue;
    }

    const tickets = Array.isArray(responseBody.data) ? responseBody.data : [];
    await persistPushTickets(chunk, tickets);
  }
}

async function sendNotificationToAllUsers(notification) {
  const deviceTargets = await getAllExpoDeviceTargets();

  await sendExpoNotifications(
    deviceTargets.map((target) => ({
      ...notification,
      to: target.token,
      userId: target.userId,
      devicePath: target.devicePath,
    }))
  );
}

async function sendNotificationToUsers(userIds, notification) {
  const deviceTargets = await getUsersExpoDeviceTargets(userIds);

  await sendExpoNotifications(
    deviceTargets.map((target) => ({
      ...notification,
      to: target.token,
      userId: target.userId,
      devicePath: target.devicePath,
    }))
  );
}

async function userHasActiveBets(userId) {
  const snapshot = await db
    .collection("predictions")
    .where("userId", "==", userId)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  return !snapshot.empty;
}

exports.dispatchScheduledMatchNotifications = onSchedule(
  {
    schedule: "every 10 minutes",
    timeZone: "Asia/Calcutta",
  },
  async () => {
    const snapshot = await db.collection("matches").where("winner", "==", null).get();
    const now = Date.now();

    for (const matchDoc of snapshot.docs) {
      const match = matchDoc.data();
      const startAtMs = Date.parse(match.startAt);
      const lockAtMs = Date.parse(match.lockAt);
      const title = getMatchTitle(match);
      const updates = {};

      if (
        !match.notifiedBettingOpenAt &&
        now >= startAtMs - 24 * 60 * 60 * 1000 &&
        now < lockAtMs
      ) {
        await sendNotificationToAllUsers({
          eventType: "betting_open",
          title,
          body: `Predictions are now open for the ${match.teamAShort} vs ${match.teamBShort} match.`,
          data: {
            target: "match",
            matchId: matchDoc.id,
          },
        });

        updates.notifiedBettingOpenAt = FieldValue.serverTimestamp();
      }

      if (
        !match.notifiedStartingSoonAt &&
        now >= lockAtMs - STARTING_SOON_LEAD_MS &&
        now < lockAtMs
      ) {
        await sendNotificationToAllUsers({
          eventType: "starting_soon",
          title,
          body: `The ${match.teamAShort} vs ${match.teamBShort} match starts soon. Place your bet before lock time.`,
          data: {
            target: "match",
            matchId: matchDoc.id,
          },
        });

        updates.notifiedStartingSoonAt = FieldValue.serverTimestamp();
      }

      if (!match.notifiedBettingLockedAt && now >= lockAtMs) {
        await sendNotificationToAllUsers({
          eventType: "betting_locked",
          title,
          body: `The ${match.teamAShort} vs ${match.teamBShort} match is locked. Predictions are now closed.`,
          data: {
            target: "match",
            matchId: matchDoc.id,
          },
        });

        updates.notifiedBettingLockedAt = FieldValue.serverTimestamp();
      }

      if (Object.keys(updates).length) {
        await matchDoc.ref.update(updates);
      }
    }
  }
);

exports.sendMatchSettlementNotifications = onDocumentUpdated(
  "matches/{matchId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    if (!before || !after || before.winner === after.winner || !after.winner) {
      return;
    }

    const predictionsSnapshot = await db
      .collection("predictions")
      .where("matchId", "==", event.params.matchId)
      .get();
    const userIds = [
      ...new Set(predictionsSnapshot.docs.map((predictionDoc) => predictionDoc.get("userId"))),
    ];

    if (!userIds.length) {
      return;
    }

    const title = getMatchTitle(after);
    const body =
      after.winner === "no_result"
        ? `The ${after.teamAShort} vs ${after.teamBShort} match ended with no result. Bets have been refunded.`
        : `Result for the ${after.teamAShort} vs ${after.teamBShort} match is out. Check your outcome.`;

    await sendNotificationToUsers(userIds, {
      eventType: after.winner === "no_result" ? "no_result" : "result_published",
      title,
      body,
      data: {
        target: "match",
        matchId: event.params.matchId,
      },
    });
  }
);

exports.sendReferralNotifications = onDocumentUpdated(
  "referrals/{referralId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    if (!before || !after || before.status === after.status) {
      return;
    }

    if (after.status === "signed_up") {
      if (after.referrerUserId) {
        await sendNotificationToUsers([after.referrerUserId], {
          eventType: "referral_signed_up",
          title: "Referral Update",
          body: "Your referred player has joined FPL.",
          data: {
            target: "my-referrals",
          },
        });
      }

      if (after.referredUserId) {
        await sendNotificationToUsers([after.referredUserId], {
          eventType: "referred_user_message",
          title: "Referral Applied",
          body: `You were referred by ${after.referrerDisplayName}.`,
          data: {
            target: "home",
          },
        });
      }

      return;
    }

    if (after.status === "first_bet_pending_settlement" && after.referrerUserId) {
      await sendNotificationToUsers([after.referrerUserId], {
        eventType: "referral_first_bet_pending",
        title: "Referral Update",
        body: "Your referred player placed their first bet. Bonus will be credited after settlement.",
        data: {
          target: "my-referrals",
        },
      });
      return;
    }

    if (after.status === "rewarded" && after.referrerUserId) {
      await sendNotificationToUsers([after.referrerUserId], {
        eventType: "referral_rewarded",
        title: "Referral Bonus",
        body: "Your referred player completed their first settled bet. Rs. 5,000 bonus credited.",
        data: {
          target: "my-referrals",
        },
      });
    }
  }
);

exports.sendBroadcastNotifications = onDocumentCreated(
  "broadcastNotifications/{broadcastId}",
  async (event) => {
    const broadcast = event.data?.data();

    if (!broadcast || broadcast.status !== "queued") {
      return;
    }

    const title =
      broadcast.type === "maintenance_notice" ? "Maintenance Notice" : "FPL Update";

    await sendNotificationToAllUsers({
      eventType: broadcast.type,
      title,
      body: broadcast.message,
      data: {
        target: "home",
      },
    });

    await event.data.ref.update({
      status: "sent",
      sentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
);

exports.sendLowBalanceNotifications = onDocumentUpdated("users/{userId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) {
    return;
  }

  const userId = event.params.userId;
  const isLowBalance = typeof after.balance === "number" && after.balance < LOW_BALANCE_THRESHOLD;
  const hadRecovered =
    typeof after.balance === "number" &&
    after.balance >= LOW_BALANCE_THRESHOLD &&
    after.lowBalanceAlertActive === true;

  if (hadRecovered) {
    await event.data.after.ref.update({
      lowBalanceAlertActive: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  if (!isLowBalance || after.lowBalanceAlertActive === true) {
    return;
  }

  if (after.notificationsEnabled === false) {
    return;
  }

  const hasActiveBets = await userHasActiveBets(userId);

  if (hasActiveBets) {
    return;
  }

  await sendNotificationToUsers([userId], {
    eventType: "low_balance",
    title: "Low Balance",
    body: "Your balance is running low.",
    data: {
      target: "home",
    },
  });

  await event.data.after.ref.update({
    lowBalanceAlertActive: true,
    lowBalanceNotifiedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
});

exports.sendGenericBalanceCreditNotifications = onDocumentCreated(
  "transactions/{transactionId}",
  async (event) => {
    const transaction = event.data?.data();

    if (!transaction || typeof transaction.amount !== "number" || transaction.amount <= 0) {
      return;
    }

    if (!transaction.userId || GENERIC_BALANCE_CREDIT_EXCLUDED_TYPES.has(transaction.type)) {
      return;
    }

    await sendNotificationToUsers([transaction.userId], {
      eventType: "balance_credit",
      title: "Wallet Update",
      body: "A wallet credit has been added to your account.",
      data: {
        target: "home",
      },
    });
  }
);

exports.checkExpoPushReceipts = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "Asia/Calcutta",
  },
  async () => {
    const snapshot = await db
      .collection("pushTickets")
      .where("checkedAt", "==", null)
      .limit(300)
      .get();

    if (snapshot.empty) {
      return;
    }

    const pendingTickets = snapshot.docs.map((ticketDoc) => ({
      ref: ticketDoc.ref,
      receiptId: ticketDoc.get("receiptId"),
      devicePath: ticketDoc.get("devicePath"),
    }));

    for (const chunk of chunkItems(pendingTickets, RECEIPT_CHUNK_SIZE)) {
      const ids = chunk.map((ticket) => ticket.receiptId).filter(Boolean);

      if (!ids.length) {
        continue;
      }

      const response = await fetch(EXPO_PUSH_RECEIPTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids }),
      });

      const responseBody = await response.json();

      if (!response.ok) {
        logger.error("Expo push receipt request failed", {
          status: response.status,
          responseBody,
        });
        continue;
      }

      const receiptData = responseBody.data ?? {};
      const batch = db.batch();

      for (const ticket of chunk) {
        const receipt = receiptData[ticket.receiptId];

        if (!receipt) {
          continue;
        }

        batch.update(ticket.ref, {
          checkedAt: FieldValue.serverTimestamp(),
          receiptStatus: receipt.status ?? "unknown",
          receiptError: receipt.details?.error ?? null,
        });

        if (receipt.details?.error === "DeviceNotRegistered" && ticket.devicePath) {
          batch.delete(db.doc(ticket.devicePath));
        }
      }

      await batch.commit();
    }
  }
);
