import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const { userId, code } = await request.json();
    if (!userId || !code) {
      return NextResponse.json({ error: "User ID and verification code are required." }, { status: 400 });
    }

    const verificationRef = adminDb.collection("phone_verifications").doc(userId);
    const verificationSnap = await verificationRef.get();

    if (!verificationSnap.exists) {
      return NextResponse.json({ error: "No active verification code found for this user." }, { status: 400 });
    }

    const data = verificationSnap.data() || {};
    const storedCode = data.code;
    const expiresAt = new Date(data.expiresAt);
    const phone = data.phone;

    if (new Date() > expiresAt) {
      await verificationRef.delete();
      return NextResponse.json({ error: "Verification code has expired. Please request a new one." }, { status: 400 });
    }

    if (storedCode !== code.trim()) {
      return NextResponse.json({ error: "Invalid verification code. Please try again." }, { status: 400 });
    }

    // Success! Update Firestore documents
    const batch = adminDb.batch();

    // Update in talents
    const talentRef = adminDb.collection("talents").doc(userId);
    const talentSnap = await talentRef.get();
    if (talentSnap.exists) {
      batch.update(talentRef, {
        phoneVerified: true,
        phone: phone,
        phoneNumber: phone
      });
    }

    // Update in users
    const userRef = adminDb.collection("users").doc(userId);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      batch.update(userRef, {
        phoneVerified: true,
        phone: phone,
        phoneNumber: phone
      });
    }

    // Delete verification doc
    batch.delete(verificationRef);

    await batch.commit();

    console.log(`[Verify OTP] Phone number verified successfully for user: ${userId}`);
    return NextResponse.json({ success: true, message: "Phone number verified successfully!" });
  } catch (error: any) {
    console.error("[Verify OTP] Error verifying OTP:", error);
    return NextResponse.json({ error: error.message || "Failed to verify code." }, { status: 500 });
  }
}
