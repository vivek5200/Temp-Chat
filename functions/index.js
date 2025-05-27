/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

initializeApp();

// Scheduled function to delete expired rooms daily
exports.cleanupExpiredRooms = onSchedule("every 24 hours", async (event) => {
  const now = Timestamp.now();
  const db = getFirestore();

  const expiredRooms = await db.collection("rooms")
    .where("expiresAt", "<=", now)
    .get();

  if (expiredRooms.empty) {
    console.log("No expired rooms to delete.");
    return;
  }

  const deletePromises = expiredRooms.docs.map(async (roomDoc) => {
    const roomRef = roomDoc.ref;
    const roomId = roomDoc.id;

    // Delete all messages in the room first
    const messagesSnapshot = await roomRef.collection("messages").get();
    const batch = db.batch();
    messagesSnapshot.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    // Delete the room itself
    await roomRef.delete();
    console.log(`Deleted room ${roomId} and its messages.`);
  });

  await Promise.all(deletePromises);
  console.log(`Deleted ${expiredRooms.size} expired rooms.`);
});
