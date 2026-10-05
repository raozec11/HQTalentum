/**
 * Manual subscription activation script for missed payments.
 * Run: node scripts/activate-subscription.mjs
 * 
 * This manually activates the subscription for company 'test' using the
 * Stripe session: cs_live_a1vBj6sEUHRdKzwmsbQN0qrQlmaKqyp6ukiizd5zsSztTOdk7zJFwRgBin
 */

import Stripe from "stripe";
import admin from "firebase-admin";
import { readFileSync } from "fs";
import { resolve } from "path";
import dotenv from "dotenv";

// Load .env.local
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const SESSION_ID = "cs_live_a1vBj6sEUHRdKzwmsbQN0qrQlmaKqyp6ukiizd5zsSztTOdk7zJFwRgBin";

async function main() {
  console.log("🔧 Manual Subscription Activation Script\n");

  // 1. Init Firebase Admin
  if (!admin.apps.length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      console.error("❌ FIREBASE_SERVICE_ACCOUNT_JSON not found in .env.local");
      process.exit(1);
    }
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log("✅ Firebase Admin initialized");
    } catch (e) {
      console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", e.message);
      process.exit(1);
    }
  }

  const db = admin.firestore();

  // 2. Init Stripe
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error("❌ STRIPE_SECRET_KEY not found in .env.local");
    process.exit(1);
  }

  const stripe = new Stripe(stripeKey);

  // 3. Retrieve session
  console.log(`\n📡 Retrieving Stripe session: ${SESSION_ID}`);
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(SESSION_ID);
    console.log(`   Payment status: ${session.payment_status}`);
    console.log(`   Company ID: ${session.metadata?.companyId}`);
    console.log(`   Plan: ${session.metadata?.planName} (${session.metadata?.planId})`);
    console.log(`   Price: $${session.metadata?.price}`);
    console.log(`   Period: ${session.metadata?.period}`);
  } catch (err) {
    console.error("❌ Failed to retrieve Stripe session:", err.message);
    process.exit(1);
  }

  if (session.payment_status !== "paid") {
    console.error(`❌ Payment status is '${session.payment_status}', not 'paid'. Aborting.`);
    process.exit(1);
  }

  const companyId = session.metadata?.companyId;
  const price = parseFloat(session.metadata?.price || "0");
  const planId = session.metadata?.planId || "starter";
  const planName = session.metadata?.planName || "Starter";
  const period = session.metadata?.period || "Monthly";

  if (!companyId) {
    console.error("❌ No companyId in session metadata. Aborting.");
    process.exit(1);
  }

  // 4. Check duplicate
  console.log(`\n🔍 Checking for duplicate payment record...`);
  const paymentsRef = db.collection("companies").doc(companyId).collection("subscriptionPayments");
  const dupSnap = await paymentsRef.where("stripeSessionId", "==", SESSION_ID).limit(1).get();

  if (!dupSnap.empty) {
    console.log("⚠️  Payment record already exists. Checking subscription status...");
    const companyDoc = await db.collection("companies").doc(companyId).get();
    const status = companyDoc.data()?.subscriptionStatus;
    if (status === "active") {
      console.log("✅ Subscription is already active. Nothing to do.");
    } else {
      console.log(`   Current status: ${status}. Activating now...`);
      await db.collection("companies").doc(companyId).update({
        subscriptionStatus: "active",
        selectedPlan: planId,
        trialWarningSent: false,
      });
      console.log("✅ Subscription activated!");
    }
    process.exit(0);
  }

  // 5. Add payment record
  console.log(`\n📝 Writing payment record to Firestore...`);
  await paymentsRef.add({
    amount: price,
    billingPeriod: `${planName} Plan (${period === "Lifetime" ? "Lifetime" : "Monthly"})`,
    paymentMethod: "Stripe Checkout",
    status: "Paid",
    stripeSessionId: SESSION_ID,
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log("✅ Payment record added");

  // 6. Activate subscription
  console.log(`\n🚀 Activating subscription for company: ${companyId}...`);
  const nextDate = new Date();
  nextDate.setMonth(nextDate.getMonth() + 1);

  const updateData = {
    subscriptionStatus: "active",
    selectedPlan: planId,
    trialWarningSent: false,
    ...(period.toLowerCase() !== "lifetime" ? { nextPaymentDate: admin.firestore.Timestamp.fromDate(nextDate) } : {}),
  };

  await db.collection("companies").doc(companyId).update(updateData);

  console.log(`\n✅ SUCCESS! Subscription activated:`);
  console.log(`   Company: ${companyId}`);
  console.log(`   Plan: ${planName} ($${price})`);
  console.log(`   Next billing: ${nextDate.toLocaleDateString("en-GB")}`);
  console.log(`\nDone! 🎉`);

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
