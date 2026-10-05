import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
  try {
    const { bookingId, companyId, payRate: bodyPayRate, jobType: bodyJobType, eventDate: bodyEventDate, paymentType = "booking", tipAmount: bodyTipAmount } = await request.json();

    if (!bookingId || !companyId) {
      return NextResponse.json({ error: "Missing bookingId or companyId" }, { status: 400 });
    }

    // ── Company Stripe Key ONLY for bookings & tips ────────────────────
    // Booking & tip payments go through the company's own Stripe account.
    // Platform Stripe key is NOT used here.
    let stripeSecretKey = "";
    try {
      const companyKeySnap = await adminDb.collection("company_stripe_keys").doc(companyId).get();
      if (companyKeySnap.exists) {
        const keyData = companyKeySnap.data() || {};
        if (keyData.stripeSecretKey && keyData.stripeSecretKey.startsWith("sk_")) {
          stripeSecretKey = keyData.stripeSecretKey;
        }
      }
    } catch (dbErr) {
      console.warn(`Could not read Stripe key for company ${companyId}:`, dbErr);
    }

    if (!stripeSecretKey) {
      return NextResponse.json(
        {
          error: "Stripe is not configured for this workspace. Please ask your administrator to add a Stripe Secret Key in Payment Settings.",
          code: "COMPANY_STRIPE_NOT_CONFIGURED"
        },
        { status: 400 }
      );
    }

    // 2. Initialize Stripe
    const stripe = new Stripe(stripeSecretKey);
    // Use configured APP_URL to avoid localhost:3000 behind reverse proxy on VPS
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    const origin = appUrl || request.nextUrl.origin;

    let session;

    if (paymentType === "tip") {
      const tipAmount = parseFloat(bodyTipAmount || "0");
      if (tipAmount <= 0) {
        return NextResponse.json({ error: "Invalid tip amount." }, { status: 400 });
      }

      // Create Stripe Checkout Session for Tip
      session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Tip for Talent - Booking #${bookingId.substring(0, 8).toUpperCase()}`,
                description: `Thank you for your appreciation!`,
              },
              unit_amount: Math.round(tipAmount * 100), // in cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${origin}/${companyId}/dashboard/client/payment/success?bookingId=${bookingId}&session_id={CHECKOUT_SESSION_ID}&paymentType=tip`,
        cancel_url: `${origin}/${companyId}/dashboard/client/bookings`,
        metadata: {
          bookingId,
          companyId,
          paymentType: "tip",
        },
      });

      // Save checkout session ID to booking for tracking (optional, skip if Admin SDK fails)
      try {
        await adminDb.collection("bookings").doc(bookingId).update({
          tipCheckoutSessionId: session.id,
        });
      } catch (dbErr) {
        console.warn("Could not update tipCheckoutSessionId on booking document server-side:", dbErr);
      }

    } else {
      // 3. Booking Payment Flow
      let payRate = parseFloat(bodyPayRate || "0");
      let jobType = bodyJobType || "Gig Request";
      let eventDate = bodyEventDate || "TBD";

      if (payRate <= 0) {
        try {
          const bookingSnap = await adminDb.collection("bookings").doc(bookingId).get();
          if (bookingSnap.exists) {
            const bookingData = bookingSnap.data() || {};
            payRate = parseFloat(bookingData.payRate || bookingData.__budget || "0");
            jobType = bookingData.jobType || bookingData.__jobType || "Gig Request";
            eventDate = bookingData.eventDate || "TBD";
          }
        } catch (dbErr) {
          console.warn("Could not retrieve booking details via Admin SDK, falling back to body parameters:", dbErr);
        }
      }

      if (payRate <= 0) {
        return NextResponse.json({ error: "Invalid booking rate for payment." }, { status: 400 });
      }

      // Create Stripe Checkout Session for Booking
      session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `${jobType} - Booking #${bookingId.substring(0, 8).toUpperCase()}`,
                description: `Event date: ${eventDate}`,
              },
              unit_amount: Math.round(payRate * 100), // in cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${origin}/${companyId}/dashboard/client/payment/success?bookingId=${bookingId}&session_id={CHECKOUT_SESSION_ID}&paymentType=booking`,
        cancel_url: `${origin}/${companyId}/dashboard/client/payment/${bookingId}`,
        metadata: {
          bookingId,
          companyId,
          paymentType: "booking",
        },
      });

      // Save checkout session ID to booking for tracking (optional, skip if Admin SDK fails)
      try {
        await adminDb.collection("bookings").doc(bookingId).update({
          checkoutSessionId: session.id,
        });
      } catch (dbErr) {
        console.warn("Could not update checkoutSessionId on booking document server-side:", dbErr);
      }
    }

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe Checkout Session creation failed:", error);
    return NextResponse.json({ error: error.message || "Failed to create payment session" }, { status: 500 });
  }
}
