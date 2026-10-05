import { NextRequest, NextResponse } from "next/server";
import { firestoreGet, firestoreUpdate } from "@/lib/firebase-rest";
import { adminDb, hasAdminCredentials } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { sendSubscriptionConfirmationEmail } from "@/lib/mail-server";
import Stripe from "stripe";

const PLAN_DEFAULTS = {
  starter: { name: "Starter", price: 49 },
  professional: { name: "Professional", price: 99 },
  enterprise: { name: "Enterprise", price: 199 }
};

async function fetchSubscriptionPlans(): Promise<Record<string, { name: string; price: number }>> {
  try {
    const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "talentumhq-33753";
    const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/subscriptionPlans?key=${API_KEY}`;
    
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("Failed to fetch subscriptionPlans via REST API, status:", res.status);
      return PLAN_DEFAULTS;
    }
    const data = await res.json();
    if (data.documents && data.documents.length > 0) {
      const dict: Record<string, { name: string; price: number }> = {};
      data.documents.forEach((doc: any) => {
        const fields = doc.fields || {};
        const nameVal = fields.name?.stringValue || "";
        const priceVal = fields.price?.integerValue 
          ? parseInt(fields.price.integerValue, 10) 
          : (fields.price?.doubleValue || 0);
        
        if (nameVal) {
          dict[nameVal.toLowerCase()] = {
            name: nameVal,
            price: Number(priceVal)
          };
        }
      });
      return dict;
    }
  } catch (err) {
    console.error("Error in fetchSubscriptionPlans:", err);
  }
  return PLAN_DEFAULTS;
}

export async function POST(request: NextRequest) {
  try {
    const { companyId, planId } = await request.json();

    if (!companyId) {
      return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
    }

    // 1. Get company details from Firestore
    const companyData = await firestoreGet(`companies/${companyId}`);
    if (!companyData) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Fetch dynamic plan prices from DB
    const plansDb = await fetchSubscriptionPlans();

    // Determine target plan
    const targetPlanId = (planId || companyData.selectedPlan || "starter").toLowerCase();
    const planInfo = plansDb[targetPlanId] || plansDb["starter"] || PLAN_DEFAULTS.starter;
    const planName = planInfo.name;

    // Determine price (check if custom pricing applies)
    const isRenewingCurrentPlan = !planId || planId.toLowerCase() === (companyData.selectedPlan || "starter").toLowerCase();
    const hasCustomPrice = companyData.customPrice !== undefined && companyData.customPrice !== null;
    const price = (isRenewingCurrentPlan && hasCustomPrice)
      ? Number(companyData.customPrice)
      : planInfo.price;

    const period = companyData.customPricePeriod === "lifetime" ? "Lifetime" : (companyData.customPricePeriod || "Monthly");

    // ── IF PRICE IS $0 OR LESS: AUTO-ACTIVATE IMMEDIATELY WITHOUT STRIPE ─────
    if (price <= 0) {
      const nextDate = new Date();
      const periodLower = String(period).toLowerCase();
      if (periodLower === "year" || periodLower === "yearly") {
        nextDate.setFullYear(nextDate.getFullYear() + 1);
      } else if (periodLower === "lifetime") {
        nextDate.setFullYear(nextDate.getFullYear() + 100);
      } else {
        // Default 1 Month extension
        nextDate.setMonth(nextDate.getMonth() + 1);
      }

      const updatePayload: Record<string, any> = {
        subscriptionStatus: "active",
        selectedPlan: targetPlanId,
        trialWarningSent: false,
        trialWarning1DaySent: false,
        trialExpiredNotificationSent: false,
      };

      if (periodLower !== "lifetime") {
        updatePayload.nextPaymentDate = Timestamp.fromDate(nextDate);
      }

      let activated = false;

      if (hasAdminCredentials) {
        try {
          await adminDb.collection("companies").doc(companyId).update(updatePayload);

          await adminDb.collection("companies").doc(companyId).collection("subscriptionPayments").add({
            amount: 0,
            billingPeriod: `${planName} Plan (${period}) - Free Custom Offer ($0)`,
            paymentMethod: "Free Custom Offer ($0)",
            status: "Paid",
            paidAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
          });
          activated = true;
          console.log(`✅ $0 Free Subscription auto-activated for company: ${companyId}`);
        } catch (err: any) {
          console.error("Failed to activate $0 subscription via Admin SDK:", err);
        }
      }

      if (!activated) {
        try {
          await firestoreUpdate(`companies/${companyId}`, updatePayload);
          activated = true;
        } catch (restErr) {
          console.error("Failed to activate $0 subscription via REST:", restErr);
        }
      }

      // Send confirmation email
      try {
        const adminEmail = companyData.adminEmail || "";
        const cName = companyData.name || companyId;
        if (adminEmail) {
          const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://cloud.talentumhq.com").replace(/\/$/, "");
          const activatedAtStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
          const nextBillingStr = periodLower === "lifetime" ? "Lifetime" : nextDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

          await sendSubscriptionConfirmationEmail({
            recipientEmail: adminEmail,
            recipientName: companyData.adminName || "Admin",
            companyId,
            companyName: cName,
            planName,
            amount: 0,
            activatedAt: activatedAtStr,
            nextBillingDate: nextBillingStr,
            dashboardLink: `${appUrl}/${companyId}/dashboard/admin/subscription`,
          });
        }
      } catch (emailErr: any) {
        console.warn("Email send failed for $0 activation:", emailErr);
      }

      return NextResponse.json({
        freeActivated: true,
        message: "Workspace subscription activated successfully for $0!",
        companyId,
        planId: targetPlanId,
      });
    }

    // ── Platform Stripe Key ONLY for subscriptions (> $0) ───────────────────
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

    if (!stripeSecretKey || stripeSecretKey.startsWith("sk_test_...")) {
      return NextResponse.json(
        { error: "Platform Stripe is not configured. Please contact support." },
        { status: 500 }
      );
    }

    // 3. Initialize Stripe & create Checkout Session
    const stripe = new Stripe(stripeSecretKey);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    const origin = appUrl || request.nextUrl.origin;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Talentum – ${planName} Plan`,
              description: `Workspace subscription for ${companyData.name || companyId}`,
            },
            unit_amount: Math.round(price * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/${companyId}/dashboard/admin/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/${companyId}/dashboard/admin/subscription?session_id={CHECKOUT_SESSION_ID}&cancelled=true`,
      metadata: {
        companyId,
        planId: targetPlanId,
        price: String(price),
        planName,
        period,
        paymentType: "subscription",
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe Subscription Checkout failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
