import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  try {
    const targetEmail = "steve@skyfire.vip";
    const targetCompanyId = "wild";

    const results: any = {
      userFix: null,
      companyFix: null
    };

    // 1. Search for user with steve@skyfire.vip
    const userQuery = await adminDb.collection("users").where("email", "==", targetEmail).get();
    
    if (userQuery.empty) {
      // Also check case-insensitive or query all users if needed
      const allUsers = await adminDb.collection("users").get();
      let foundDoc: any = null;
      allUsers.forEach(d => {
        const u = d.data();
        if (u.email?.toLowerCase() === targetEmail.toLowerCase()) {
          foundDoc = d;
        }
      });

      if (foundDoc) {
        await adminDb.collection("users").doc(foundDoc.id).update({
          role: "admin",
          companyId: targetCompanyId,
          status: "active"
        });
        results.userFix = { uid: foundDoc.id, email: targetEmail, role: "admin", companyId: targetCompanyId, note: "Found via scan & updated" };
      } else {
        results.userFix = { error: `User with email ${targetEmail} not found in users collection.` };
      }
    } else {
      const userDoc = userQuery.docs[0];
      await adminDb.collection("users").doc(userDoc.id).update({
        role: "admin",
        companyId: targetCompanyId,
        status: "active"
      });
      results.userFix = { uid: userDoc.id, email: targetEmail, role: "admin", companyId: targetCompanyId, note: "Updated directly" };
    }

    // 2. Update company wild
    const companySnap = await adminDb.collection("companies").doc(targetCompanyId).get();
    if (companySnap.exists) {
      const updatePayload: any = {
        adminEmail: targetEmail,
        status: "active"
      };
      if (results.userFix?.uid) {
        updatePayload.adminId = results.userFix.uid;
      }
      await adminDb.collection("companies").doc(targetCompanyId).update(updatePayload);
      results.companyFix = { companyId: targetCompanyId, ...updatePayload, note: "Updated company settings" };
    } else {
      // Check if wild is stored under a different casing
      const allComp = await adminDb.collection("companies").get();
      let foundCompDoc: any = null;
      allComp.forEach(d => {
        if (d.id.toLowerCase() === targetCompanyId.toLowerCase()) {
          foundCompDoc = d;
        }
      });

      if (foundCompDoc) {
        const updatePayload: any = {
          adminEmail: targetEmail,
          status: "active"
        };
        if (results.userFix?.uid) {
          updatePayload.adminId = results.userFix.uid;
        }
        await adminDb.collection("companies").doc(foundCompDoc.id).update(updatePayload);
        results.companyFix = { companyId: foundCompDoc.id, ...updatePayload, note: "Updated company settings (found via case scan)" };
      } else {
        results.companyFix = { error: `Company ${targetCompanyId} not found.` };
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error("Fix admin error:", error);
    return NextResponse.json({ success: false, error: error.message || String(error) }, { status: 500 });
  }
}
