import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import Stripe from "stripe";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");
    const bookingId = searchParams.get("bookingId");
    const paymentType = searchParams.get("paymentType") || "booking";

    if (!sessionId || !bookingId) {
      return NextResponse.json({ error: "Missing session_id or bookingId" }, { status: 400 });
    }

    // 1. Resolve companyId from the booking document
    let companyId = "";
    try {
      const bookingSnap = await adminDb.collection("bookings").doc(bookingId).get();
      if (bookingSnap.exists) {
        companyId = bookingSnap.data()?.companyId || "";
      }
    } catch (dbErr) {
      console.warn("Could not fetch booking document to resolve companyId:", dbErr);
    }

    // 2. Resolve Stripe Secret Key (Custom Company Key first, then Platform fallback)
    let stripeSecretKey = "";
    if (companyId) {
      try {
        const companyKeySnap = await adminDb.collection("company_stripe_keys").doc(companyId).get();
        if (companyKeySnap.exists) {
          const keyData = companyKeySnap.data() || {};
          if (keyData.stripeSecretKey && keyData.stripeSecretKey.startsWith("sk_")) {
            stripeSecretKey = keyData.stripeSecretKey;
          }
        }
      } catch (dbErr) {
        console.warn(`Could not read custom Stripe key for company ${companyId}:`, dbErr);
      }
    }

    if (!stripeSecretKey) {
      stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
      if (!stripeSecretKey || stripeSecretKey === "sk_test_...") {
        try {
          const settingsSnap = await adminDb.collection("platform_settings").doc("general").get();
          const settingsData = settingsSnap.data() || {};
          if (settingsData.stripeSecretKey) {
            stripeSecretKey = settingsData.stripeSecretKey;
          }
        } catch (dbErr) {
          console.warn("Could not read Stripe Secret Key from Firestore via Admin SDK:", dbErr);
        }
      }
    }

    if (!stripeSecretKey || stripeSecretKey === "sk_test_...") {
      return NextResponse.json({ error: "Stripe Secret Key is missing or not configured." }, { status: 500 });
    }

    // 2. Initialize Stripe
    const stripe = new Stripe(stripeSecretKey);

    // 3. Retrieve Checkout Session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === "paid") {
      let updateSuccessful = false;
      const paymentIntentId = (session.payment_intent as string) || null;

      try {
        if (paymentType === "tip") {
          // Update tip details on the booking
          await adminDb.collection("bookings").doc(bookingId).update({
            tipStatus: "Paid",
            tipStripePaymentIntentId: paymentIntentId,
            tipPaidAt: new Date().toISOString(),
          });
        } else {
          // Update booking status
          await adminDb.collection("bookings").doc(bookingId).update({
            status: "Confirmed",
            paymentMethod: "Credit Card",
            paymentStatus: "Paid",
            stripePaymentIntentId: paymentIntentId,
            paidAt: new Date().toISOString(),
          });
        }
        updateSuccessful = true;
      } catch (dbErr) {
        console.warn(`Failed to update booking (${paymentType}) server-side via Firebase Admin:`, dbErr);
      }

      return NextResponse.json({ 
        paid: true, 
        updateSuccessful,
        stripePaymentIntentId: paymentIntentId
      });
    } else {
      return NextResponse.json({ paid: false, error: "Payment was not completed." });
    }
  } catch (error: any) {
    console.error("Stripe verification failed:", error);
    return NextResponse.json({ error: error.message || "Verification failed" }, { status: 500 });
  }
}
