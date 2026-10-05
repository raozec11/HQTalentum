import { NextRequest, NextResponse } from "next/server";
import { sendTalentWelcomeEmail } from "@/lib/mail-server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { talentUid, talentEmail, talentName, companyId, companyName, password } = body;

    if (!talentUid || !talentEmail || !talentName || !companyId || !password) {
      return NextResponse.json(
        { error: "Missing required fields: talentUid, talentEmail, talentName, companyId, password" },
        { status: 400 }
      );
    }

    // Generate Firebase email verification link using Admin SDK
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:9850";
    const actionCodeSettings = {
      url: `${appUrl}/${companyId}/login`,
      handleCodeInApp: false,
    };

    let verificationLink = "";
    try {
      const fbLink = await adminAuth.generateEmailVerificationLink(
        talentEmail,
        actionCodeSettings
      );
      try {
        const urlObj = new URL(fbLink);
        const oobCode = urlObj.searchParams.get("oobCode");
        verificationLink = `${appUrl}/${companyId}/verify-email?oobCode=${oobCode}`;
      } catch (parseErr) {
        console.warn("Failed to parse verification link, using fallback:", parseErr);
        verificationLink = fbLink;
      }
    } catch (linkErr: any) {
      console.error("Failed to generate verification link:", linkErr);
      return NextResponse.json(
        { error: "Failed to generate email verification link: " + (linkErr.message || linkErr) },
        { status: 500 }
      );
    }

    // Send the welcome email
    const result = await sendTalentWelcomeEmail({
      talentEmail,
      talentName,
      companyName: companyName || companyId,
      companyId,
      password,
      verificationLink,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (error: any) {
    console.error("Error in send-talent-welcome route:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send talent welcome email" },
      { status: 500 }
    );
  }
}
