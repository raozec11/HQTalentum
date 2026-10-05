import { NextRequest, NextResponse } from "next/server";
import { sendVerificationOnlyEmail } from "@/lib/mail-server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, companyId } = body;

    if (!email || !companyId) {
      return NextResponse.json(
        { error: "Missing required fields: email, companyId" },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Fetch user's name from Firestore
    let name = "User";
    try {
      // Find user by email
      const userSnap = await adminDb
        .collection("users")
        .where("email", "==", cleanEmail)
        .limit(1)
        .get();

      if (!userSnap.empty) {
        const uDoc = userSnap.docs[0];
        const userData = uDoc.data();
        name = userData.name || userData.displayName || "User";

        // Try getting details from talents collection too for stage name
        const talentSnap = await adminDb.collection("talents").doc(uDoc.id).get();
        if (talentSnap.exists) {
          name = talentSnap.data()?.displayName || name;
        }
      }
    } catch (dbErr) {
      console.warn("Failed to retrieve name from DB for verification:", dbErr);
    }

    // 2. Fetch company name
    let companyName = companyId;
    try {
      const compSnap = await adminDb.collection("companies").doc(companyId).get();
      if (compSnap.exists) {
        companyName = compSnap.data()?.name || companyId;
      }
    } catch (e) {
      console.error("Failed to fetch company name:", e);
    }

    // 3. Generate verification link using Admin SDK
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:9850";
    const actionCodeSettings = {
      url: `${appUrl}/${companyId}/login`,
      handleCodeInApp: false,
    };

    let verificationLink = "";
    try {
      const fbLink = await adminAuth.generateEmailVerificationLink(
        cleanEmail,
        actionCodeSettings
      );
      const urlObj = new URL(fbLink);
      const oobCode = urlObj.searchParams.get("oobCode");
      verificationLink = `${appUrl}/${companyId}/verify-email?oobCode=${oobCode}`;
    } catch (linkErr: any) {
      console.error("Failed to generate verification link:", linkErr);
      return NextResponse.json(
        { error: "Failed to generate email verification link: " + (linkErr.message || linkErr) },
        { status: 500 }
      );
    }

    // 4. Send the verification only email via Resend
    const result = await sendVerificationOnlyEmail({
      email: cleanEmail,
      name,
      companyName,
      companyId,
      verificationLink,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (error: any) {
    console.error("Error in send-verification-email route:", error);
    return NextResponse.json(
      { error: error.message || "Failed to resend verification email" },
      { status: 500 }
    );
  }
}
