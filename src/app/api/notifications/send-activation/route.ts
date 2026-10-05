import { NextRequest, NextResponse } from "next/server";
import { sendActivationEmail } from "@/lib/mail-server";
import { firestoreGet, firestoreUpdate } from "@/lib/firebase-rest";
import { adminDb } from "@/lib/firebase-admin";

const hasAdminSdk = !!(process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId } = body;

    if (!companyId) {
      return NextResponse.json(
        { error: "Missing required field: companyId" },
        { status: 400 }
      );
    }

    // 1. Fetch company details from firestore
    let companyData;
    if (hasAdminSdk) {
      const snap = await adminDb.collection("companies").doc(companyId).get();
      companyData = snap.exists ? snap.data() : null;
    } else {
      companyData = await firestoreGet(`companies/${companyId}`);
    }

    if (!companyData) {
      return NextResponse.json(
        { error: `Company with ID "${companyId}" not found` },
        { status: 404 }
      );
    }

    if (companyData.emailVerified && companyData.trialActivated) {
      return NextResponse.json(
        { error: "This workspace has already been activated" },
        { status: 400 }
      );
    }

    // 2. Read existing token or generate new one if requested (indicated by Authorization header)
    let activationToken = companyData.activationToken;
    const authHeader = request.headers.get("Authorization");

    if (!activationToken || authHeader) {
      activationToken = Array.from({ length: 32 }, () => 
        Math.floor(Math.random() * 16).toString(16)
      ).join("");

      // Write the new token to Firestore
      const idToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
      if (hasAdminSdk) {
        await adminDb.collection("companies").doc(companyId).update({
          activationToken: activationToken
        });
      } else {
        await firestoreUpdate(`companies/${companyId}`, {
          activationToken: activationToken
        }, idToken);
      }
    }

    // 3. Send the email containing the token (SMTP)
    const result = await sendActivationEmail(
      companyId,
      companyData.name || companyId,
      companyData.adminEmail || companyData.contactEmail,
      companyData.contactPerson || "Workspace Owner",
      activationToken
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in send-activation API route:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process activation email request" },
      { status: 500 }
    );
  }
}
