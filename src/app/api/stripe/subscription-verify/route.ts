import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { adminDb, hasAdminCredentials } from "@/lib/firebase-admin";
import { firestoreGet } from "@/lib/firebase-rest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { sendSubscriptionConfirmationEmail } from "@/lib/mail-server";

/**
 * Subscription Verify + Activate API Route
 *
 * 1. Verifies the Stripe session payment status via Stripe API.
 * 2. If paid, activates the subscription server-side using Firebase Admin SDK
 *    (bypasses Firestore security rules, no client auth timing issues).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");
    const forceFailed = searchParams.get("failed") === "true";

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    }

    // ── Resolve Platform Stripe Key ─────────────────────────────────────────
    // Subscription verification always uses the platform's Stripe account.
    let stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";

    if (!stripeSecretKey || stripeSecretKey.startsWith("sk_test_...")) {
      try {
        const settings = await firestoreGet("platform_settings/general");
        if (settings?.stripeSecretKey) {
          stripeSecretKey = settings.stripeSecretKey;
        }
      } catch (dbErr) {
        console.warn("Could not read platform Stripe key from Firestore:", dbErr);
      }
    }

    if (!stripeSecretKey) {
      return NextResponse.json({ error: "Stripe Secret Key is not configured." }, { status: 500 });
    }

    // ── Retrieve Stripe Session ─────────────────────────────────────────────
    const stripe = new Stripe(stripeSecretKey);
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (stripeErr: any) {
      console.error("Stripe session retrieval failed:", stripeErr.message);
      return NextResponse.json(
        { error: `Stripe verification error: ${stripeErr.message}` },
        { status: 500 }
      );
    }

    const companyId = session.metadata?.companyId;
    if (!companyId) {
      return NextResponse.json(
        { error: "Invalid session metadata: missing companyId" },
        { status: 400 }
      );
    }

    const price = parseFloat(session.metadata?.price || "0");
    const planId = session.metadata?.planId || "starter";
    const planName = session.metadata?.planName || "Starter";
    const period = session.metadata?.period || "Monthly";

    const isPaid = (session.payment_status === "paid" || session.payment_status === "no_payment_required") && !forceFailed;

    let serverActivated = false;

    // ── Server-side Activation via Firebase Admin SDK ───────────────────────
    // Uses service account credentials — bypasses Firestore security rules.
    // This is reliable and doesn't depend on client auth timing.
    if (isPaid && hasAdminCredentials) {
      try {
        const paymentsRef = adminDb
          .collection("companies")
          .doc(companyId)
          .collection("subscriptionPayments");

        // 1. Duplicate check — don't process same session twice
        const dupSnap = await paymentsRef
          .where("stripeSessionId", "==", sessionId)
          .limit(1)
          .get();

        if (dupSnap.empty) {
          // 2. Calculate next billing date
          const nextDate = new Date();
          nextDate.setMonth(nextDate.getMonth() + 1);

          // 3. Log payment record
          await paymentsRef.add({
            amount: price,
            billingPeriod: `${planName} Plan (${period === "Lifetime" ? "Lifetime" : "Monthly"})`,
            paymentMethod: "Stripe Checkout",
            status: "Paid",
            stripeSessionId: sessionId,
            paidAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
          });

          // 4. Activate company subscription
          const updateData: Record<string, any> = {
            subscriptionStatus: "active",
            selectedPlan: planId,
            trialWarningSent: false,
          };

          if (period.toLowerCase() !== "lifetime") {
            updateData.nextPaymentDate = Timestamp.fromDate(nextDate);
          }

          await adminDb.collection("companies").doc(companyId).update(updateData);

          serverActivated = true;
          console.log(
            `✅ Subscription activated for company: ${companyId}, plan: ${planId}, amount: $${price}`
          );

          // 5. Send confirmation email to the company admin
          try {
            // Fetch company admin details
            const companyDoc = await adminDb.collection("companies").doc(companyId).get();
            const companyData = companyDoc.data() || {};
            const adminEmail = companyData.adminEmail || "";
            const companyName = companyData.name || companyId;

            if (adminEmail) {
              // Resolve admin name
              let adminName = "Admin";
              try {
                const adminId = companyData.adminId || "";
                if (adminId) {
                  const userSnap = await adminDb.collection("users").doc(adminId).get();
                  if (userSnap.exists) {
                    adminName = userSnap.data()?.name || userSnap.data()?.displayName || "Admin";
                  }
                }
              } catch (_) {}

              const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://cloud.talentumhq.com").replace(/\/$/, "");
              const activatedAt = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
              const nextBillingDate = nextDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

              await sendSubscriptionConfirmationEmail({
                recipientEmail: adminEmail,
                recipientName: adminName,
                companyId,
                companyName,
                planName,
                amount: price,
                activatedAt,
                nextBillingDate: period.toLowerCase() === "lifetime" ? "Lifetime" : nextBillingDate,
                dashboardLink: `${appUrl}/${companyId}/dashboard/admin/subscription`,
              });
            }
          } catch (emailErr: any) {
            // Non-fatal — don't block the response for email failures
            console.warn("Could not send subscription confirmation email:", emailErr.message);
          }

        } else {
          // Already processed — subscription is already active
          serverActivated = true;
          console.log(
            `ℹ️ Session ${sessionId} already processed for company: ${companyId}`
          );
        }
      } catch (activationErr: any) {
        // Log but don't fail — client-side will attempt as backup
        console.error(
          "Server-side subscription activation failed:",
          activationErr.message
        );
      }
    } else if (isPaid && !hasAdminCredentials) {
      console.warn(
        "⚠️ No Firebase Admin credentials — skipping server-side activation. " +
        "Add FIREBASE_SERVICE_ACCOUNT_JSON to .env to enable reliable activation."
      );
    }

    return NextResponse.json({
      paid: isPaid,
      companyId,
      planId,
      planName,
      price,
      period,
      stripeSessionId: sessionId,
      serverActivated,
      error: isPaid ? undefined : "Payment was not completed or was cancelled.",
    });
  } catch (error: any) {
    console.error("Stripe Subscription verification failed:", error);
    return NextResponse.json(
      { error: error.message || "Verification failed" },
      { status: 500 }
    );
  }
}
