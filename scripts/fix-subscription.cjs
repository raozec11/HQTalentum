/**
 * Manual subscription activation — no external deps beyond what's in node_modules
 * Usage: node scripts/fix-subscription.cjs
 */
const fs = require("fs");
const admin = require("firebase-admin");
const Stripe = require("stripe");

// ── Read .env.local manually ──────────────────────────────────────────────────
function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const vars = {};
  // Handle multi-line values wrapped in single quotes
  const regex = /^([A-Z_][A-Z0-9_]*)=('[\s\S]*?'|"[\s\S]*?"|[^\n]*)/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    let val = match[2];
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1);
    }
    vars[match[1]] = val;
  }
  return vars;
}

const env = parseEnvFile("F:/WEB APPS/COMPANY/Talentum/.env.local");
const STRIPE_KEY = env["STRIPE_SECRET_KEY"];
const SA_JSON = env["FIREBASE_SERVICE_ACCOUNT_JSON"];
const SESSION_ID = "cs_live_a1vBj6sEUHRdKzwmsbQN0qrQlmaKqyp6ukiizd5zsSztTOdk7zJFwRgBin";

if (!STRIPE_KEY) { console.error("No STRIPE_SECRET_KEY found"); process.exit(1); }
if (!SA_JSON) { console.error("No FIREBASE_SERVICE_ACCOUNT_JSON found"); process.exit(1); }

// ── Initialize Firebase Admin ─────────────────────────────────────────────────
let serviceAccount;
try {
  serviceAccount = JSON.parse(SA_JSON);
} catch (e) {
  console.error("Failed to parse service account JSON:", e.message);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// ── Initialize Stripe ─────────────────────────────────────────────────────────
const stripe = new Stripe(STRIPE_KEY);

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log("\n🔧 Manual Subscription Activation");
  console.log("   Session:", SESSION_ID, "\n");

  // 1. Retrieve session
  console.log("📡 Retrieving Stripe session...");
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(SESSION_ID);
  } catch (e) {
    console.error("❌ Stripe error:", e.message);
    process.exit(1);
  }

  console.log("   payment_status:", session.payment_status);
  console.log("   companyId:     ", session.metadata?.companyId);
  console.log("   planId:        ", session.metadata?.planId);
  console.log("   planName:      ", session.metadata?.planName);
  console.log("   price:         $", session.metadata?.price);
  console.log("   period:        ", session.metadata?.period);

  if (session.payment_status !== "paid") {
    console.error("\n❌ Payment not confirmed. Status:", session.payment_status);
    process.exit(1);
  }

  const { companyId, planId, planName, price, period } = session.metadata;
  const priceNum = parseFloat(price || "0");

  // 2. Duplicate check
  console.log("\n🔍 Checking for duplicate payment record...");
  const paymentsRef = db.collection("companies").doc(companyId).collection("subscriptionPayments");
  const dup = await paymentsRef.where("stripeSessionId", "==", SESSION_ID).limit(1).get();

  if (dup.empty) {
    // 3. Write payment record
    console.log("📝 Adding payment record...");
    await paymentsRef.add({
      amount: priceNum,
      billingPeriod: `${planName} Plan (${period === "Lifetime" ? "Lifetime" : "Monthly"})`,
      paymentMethod: "Stripe Checkout",
      status: "Paid",
      stripeSessionId: SESSION_ID,
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log("   ✅ Payment record saved");
  } else {
    console.log("   ⚠️  Record already exists, skipping write");
  }

  // 4. Activate subscription
  console.log("\n🚀 Activating subscription...");
  const nextDate = new Date();
  nextDate.setMonth(nextDate.getMonth() + 1);

  await db.collection("companies").doc(companyId).update({
    subscriptionStatus: "active",
    selectedPlan: planId,
    trialWarningSent: false,
    nextPaymentDate: admin.firestore.Timestamp.fromDate(nextDate),
  });

  console.log("\n✅ SUCCESS!");
  console.log("   Company:      ", companyId);
  console.log("   Plan:         ", planName, `($${priceNum})`);
  console.log("   Next billing: ", nextDate.toLocaleDateString("en-GB"));
  console.log("\nDone! 🎉\n");
  process.exit(0);
}

run().catch((e) => {
  console.error("❌ Fatal:", e.message);
  process.exit(1);
});
