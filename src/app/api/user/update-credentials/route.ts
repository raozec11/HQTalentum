import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { sendEmailChangedOldAlert, sendEmailChangedNewVerify } from "@/lib/mail-server";
import { sendSmsNotification } from "@/lib/sms-server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetUid, newEmail, newPhone } = body;

    if (!targetUid || typeof targetUid !== "string") {
      return NextResponse.json(
        { error: "Target User ID (targetUid) is required." },
        { status: 400 }
      );
    }

    const trimmedEmail = newEmail ? newEmail.trim().toLowerCase() : undefined;
    const trimmedPhone = newPhone ? newPhone.trim() : undefined;

    if (!trimmedEmail && trimmedPhone === undefined) {
      return NextResponse.json(
        { error: "No changes provided. Specify newEmail or newPhone." },
        { status: 400 }
      );
    }

    // 0. Fetch existing user / talent doc to get old credentials, companyId and name
    const userRef = adminDb.collection("users").doc(targetUid);
    const talentRef = adminDb.collection("talents").doc(targetUid);
    const clientRef = adminDb.collection("clients").doc(targetUid);

    const [userSnap, talentSnap] = await Promise.all([
      userRef.get(),
      talentRef.get(),
    ]);

    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const talentData = talentSnap.exists ? talentSnap.data() || {} : {};

    const oldEmail = (userData.email || talentData.email || "").trim().toLowerCase();
    const oldPhone = (userData.phone || userData.phoneNumber || talentData.phone || talentData.phoneNumber || "").trim();
    const companyId = userData.companyId || talentData.companyId || "wild";
    const userName = talentData.displayName || talentData.name || userData.name || userData.displayName || "User";

    // Fetch company name if possible
    let companyName = companyId;
    try {
      const compSnap = await adminDb.collection("companies").doc(companyId).get();
      if (compSnap.exists) {
        companyName = compSnap.data()?.name || companyId;
      }
    } catch (e) {
      console.warn("Could not fetch company name for credential update email:", e);
    }

    const updatesAuth: Record<string, any> = {};
    const updatesFirestore: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    const isEmailChanged = trimmedEmail && trimmedEmail !== oldEmail;
    const isPhoneChanged = trimmedPhone !== undefined && trimmedPhone !== oldPhone;

    // 1. Validate & Update Email in Firebase Auth
    if (trimmedEmail) {
      try {
        const existingAuthUser = await adminAuth.getUserByEmail(trimmedEmail);
        if (existingAuthUser && existingAuthUser.uid !== targetUid) {
          return NextResponse.json(
            { error: "This email address is already in use by another account." },
            { status: 400 }
          );
        }
      } catch (err: any) {
        // auth/user-not-found means email is available, which is expected
        if (err.code !== "auth/user-not-found") {
          console.warn("Error checking email uniqueness in Firebase Auth:", err);
        }
      }

      updatesAuth.email = trimmedEmail;
      updatesFirestore.email = trimmedEmail;
      updatesFirestore.talentEmail = trimmedEmail;
      updatesFirestore.clientEmail = trimmedEmail;
      if (isEmailChanged) {
        updatesFirestore.emailVerified = false;
      }
    }

    // 2. Validate & Update Phone in Firestore and Auth
    if (trimmedPhone !== undefined) {
      updatesFirestore.phone = trimmedPhone;
      updatesFirestore.phoneNumber = trimmedPhone;
      updatesFirestore.talentPhone = trimmedPhone;
      updatesFirestore.clientPhone = trimmedPhone;

      // Format E.164 for Firebase Auth if valid (e.g. +1234567890), otherwise log warning
      if (trimmedPhone.startsWith("+") && trimmedPhone.length >= 8) {
        updatesAuth.phoneNumber = trimmedPhone;
      }
    }

    // 3. Update Firebase Auth User
    if (Object.keys(updatesAuth).length > 0) {
      try {
        await adminAuth.updateUser(targetUid, updatesAuth);
      } catch (authErr: any) {
        console.error(`Firebase Auth updateUser failed for ${targetUid}:`, authErr);
        if (authErr.code === "auth/email-already-exists") {
          return NextResponse.json(
            { error: "This email address is already registered." },
            { status: 400 }
          );
        }
        if (authErr.code === "auth/invalid-phone-number") {
          delete updatesAuth.phoneNumber;
        } else if (authErr.code !== "auth/user-not-found") {
          return NextResponse.json(
            { error: authErr.message || "Failed to update authentication account." },
            { status: 400 }
          );
        }
      }
    }

    // 4. Update Firestore Collections
    if (userSnap.exists) {
      await userRef.update(updatesFirestore);
    } else {
      await userRef.set(updatesFirestore, { merge: true });
    }

    if (talentSnap.exists) {
      await talentRef.update(updatesFirestore);
    }

    const clientSnap = await clientRef.get();
    if (clientSnap.exists) {
      await clientRef.update(updatesFirestore);
    }

    // 5. Send Security & Verification Notifications
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cloud.talentumhq.com";

    // A. Email Changed Flow: Old Email Alert + New Email Verification
    if (isEmailChanged && trimmedEmail) {
      // 1. Alert Old Email
      if (oldEmail && oldEmail.includes("@")) {
        sendEmailChangedOldAlert({
          oldEmail,
          newEmail: trimmedEmail,
          name: userName,
          companyName,
        }).catch((err) => console.error("Failed to send old email alert:", err));
      }

      // 2. Generate Verification Link & Send to New Email
      let verificationLink = `${appUrl}/${companyId.toLowerCase()}/verify-email?email=${encodeURIComponent(trimmedEmail)}`;
      try {
        const link = await adminAuth.generateEmailVerificationLink(trimmedEmail);
        if (link) verificationLink = link;
      } catch (err) {
        console.warn("Could not generate Firebase Auth verification link, using fallback verification link:", err);
      }

      sendEmailChangedNewVerify({
        newEmail: trimmedEmail,
        name: userName,
        companyName,
        companyId: companyId.toLowerCase(),
        verificationLink,
      }).catch((err) => console.error("Failed to send new email verification link:", err));
    }

    // B. Phone Changed Flow: Old Phone Alert + New Phone Confirmation
    if (isPhoneChanged && trimmedPhone !== undefined) {
      // 1. Alert Old Phone if available
      if (oldPhone) {
        sendSmsNotification(
          targetUid,
          "Security Alert: Phone Number Updated",
          `Your Talentum account phone number was updated to ${trimmedPhone}. If you did not request this, contact support.`,
          oldPhone,
          companyId
        ).catch((err) => console.error("Failed to send old phone SMS alert:", err));
      }

      // 2. Send Confirmation SMS to New Phone
      if (trimmedPhone) {
        sendSmsNotification(
          targetUid,
          "Phone Number Updated",
          `Your phone number has been updated successfully for your ${companyName} account on Talentum.`,
          trimmedPhone,
          companyId
        ).catch((err) => console.error("Failed to send new phone SMS confirmation:", err));
      }
    }

    return NextResponse.json({
      success: true,
      message: "Credentials updated successfully with security alerts & verification links sent.",
      targetUid,
      email: trimmedEmail,
      phone: trimmedPhone,
      isEmailChanged,
      isPhoneChanged,
    });
  } catch (error: any) {
    console.error("Error in update-credentials API route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error updating user credentials." },
      { status: 500 }
    );
  }
}
