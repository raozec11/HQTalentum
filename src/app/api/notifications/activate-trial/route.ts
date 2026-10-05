import { NextRequest, NextResponse } from "next/server";
import { firestoreGet, firestoreUpdate } from "@/lib/firebase-rest";
import { adminDb } from "@/lib/firebase-admin";

const hasAdminSdk = !!(process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, token } = body;

    if (!companyId || !token) {
      return NextResponse.json(
        { error: "Missing required fields (companyId, token)" },
        { status: 400 }
      );
    }

    // 1. Fetch company details
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

    // 2. Check if already activated
    if (companyData.emailVerified && companyData.trialActivated) {
      return NextResponse.json({
        success: true,
        companyName: companyData.name || companyId,
        alreadyActive: true
      });
    }

    // 3. Verify activation token
    if (!companyData.activationToken || companyData.activationToken !== token) {
      return NextResponse.json(
        { error: "Invalid or expired activation link" },
        { status: 400 }
      );
    }

    // 4. Calculate trial end date (7 days from now)
    const trialEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // 5. Update company details to activate
    if (hasAdminSdk) {
      const { admin } = await import("@/lib/firebase-admin");
      await adminDb.collection("companies").doc(companyId).update({
        emailVerified: true,
        trialActivated: true,
        trialEndDate: admin.firestore.Timestamp.fromDate(trialEndDate),
        activationToken: null
      });
    } else {
      await firestoreUpdate(`companies/${companyId}`, {
        emailVerified: true,
        trialActivated: true,
        trialEndDate: trialEndDate,
        activationToken: null,
        verifyToken: token
      });
    }

    return NextResponse.json({
      success: true,
      companyName: companyData.name || companyId,
      alreadyActive: false
    });
  } catch (error: any) {
    console.error("Error in activate-trial API route:", error);
    return NextResponse.json(
      { error: error.message || "Failed to activate trial" },
      { status: 500 }
    );
  }
}
