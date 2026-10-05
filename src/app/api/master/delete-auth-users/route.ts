import { NextRequest, NextResponse } from "next/server";
import { admin, hasAdminCredentials } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Fetch the user document from Firestore to verify role
    const userDoc = await admin.firestore().collection("users").doc(decodedToken.uid).get();
    if (!userDoc.exists || (userDoc.data()?.role !== "platform_admin" && userDoc.data()?.role !== "master")) {
      return NextResponse.json({ error: "Forbidden: Platform Admin privileges required." }, { status: 403 });
    }

    if (!hasAdminCredentials) {
      return NextResponse.json({ error: "Firebase Admin credentials are not configured on this server." }, { status: 500 });
    }

    const { uids } = await request.json();
    if (!uids || !Array.isArray(uids) || uids.length === 0) {
      return NextResponse.json({ error: "Invalid or empty UIDs list." }, { status: 400 });
    }

    // Direct deletion in Firebase Auth
    // Firebase Admin Auth supports deleteUsers(uids) up to 1000 users per call.
    const chunks = [];
    for (let i = 0; i < uids.length; i += 1000) {
      chunks.push(uids.slice(i, i + 1000));
    }

    for (const chunk of chunks) {
      await admin.auth().deleteUsers(chunk);
    }

    console.log(`[Master Auth] Deleted ${uids.length} users from Firebase Authentication.`);
    return NextResponse.json({ success: true, message: `Successfully deleted ${uids.length} users from Firebase Authentication.` });
  } catch (error: any) {
    console.error("[Master Auth] Failed to delete auth users:", error);
    return NextResponse.json({ error: error.message || "Failed to delete users." }, { status: 500 });
  }
}
