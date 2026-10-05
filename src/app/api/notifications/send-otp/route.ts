import { NextRequest, NextResponse } from "next/server";
import { admin, adminDb } from "@/lib/firebase-admin";
import { sendSmsNotification } from "@/lib/sms-server";

export async function POST(request: NextRequest) {
  try {
    const { userId, phone } = await request.json();
    if (!userId || !phone) {
      return NextResponse.json({ error: "User ID and phone number are required." }, { status: 400 });
    }

    // Normalize phone number (strip non-digits, format with leading +)
    let digits = phone.replace(/\D/g, "");
    let toNumber = "";
    if (phone.startsWith("+")) {
      toNumber = `+${digits}`;
    } else {
      if (digits.length === 10) {
        toNumber = `+1${digits}`;
      } else {
        toNumber = `+${digits}`;
      }
    }

    // Generate a 6-digit OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Save verification info to Firestore
    await adminDb.collection("phone_verifications").doc(userId).set({
      userId,
      phone: toNumber,
      code: otpCode,
      expiresAt: expiry.toISOString(),
      createdAt: new Date().toISOString()
    });

    // Send the SMS
    const title = "Verification Code";
    const message = `Your verification code is ${otpCode}. It is valid for 10 minutes.`;
    const smsResult = await sendSmsNotification(userId, title, message, toNumber);

    if (!smsResult.success) {
      return NextResponse.json({ error: smsResult.error || "Failed to send SMS code." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Verification code sent successfully." });
  } catch (error: any) {
    console.error("[Send OTP] Error sending verification SMS:", error);
    return NextResponse.json({ error: error.message || "Failed to send verification code." }, { status: 500 });
  }
}
