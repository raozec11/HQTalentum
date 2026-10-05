import { NextRequest, NextResponse } from "next/server";
import { admin, hasAdminCredentials } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const { uid, newPassword } = await request.json();
    if (!uid || !newPassword) {
      return NextResponse.json({ error: "UID and new password are required." }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    if (!hasAdminCredentials) {
      return NextResponse.json({ error: "Firebase Admin credentials are not configured on this server." }, { status: 500 });
    }

    // Direct password update in Firebase Auth
    await admin.auth().updateUser(uid, { password: newPassword });

    console.log(`[Master Auth] Direct password update successful for user: ${uid}`);

    return NextResponse.json({ success: true, message: "Password updated successfully." });
  } catch (error: any) {
    console.error("[Master Auth] Failed to update password directly:", error);
    return NextResponse.json({ error: error.message || "Failed to update password." }, { status: 500 });
  }
}
