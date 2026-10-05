import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendEmailNotification } from "@/lib/mail-server";
import { sendSmsNotification } from "@/lib/sms-server";
import admin from "firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, payload, excludeUserId } = body;

    if (!companyId || !payload || !payload.title || !payload.message) {
      return NextResponse.json(
        { error: "Missing required fields (companyId, payload with title & message)" },
        { status: 400 }
      );
    }

    const ids = Array.from(new Set([companyId, companyId.toLowerCase(), companyId.toUpperCase()]));
    
    // Resolve company primary phone as fallback
    let companyPhone = "";
    try {
      const companySnap = await adminDb.collection("companies").doc(companyId).get();
      if (companySnap.exists) {
        const cData = companySnap.data() || {};
        companyPhone = cData.contactPhone || cData.phone || "";
      }
    } catch (cErr) {
      console.warn("Failed to fetch company contact phone for fallback:", cErr);
    }

    const adminsMap = new Map<string, { email: string; phone: string; name: string }>();

    for (const cid of ids) {
      try {
        const snap = await adminDb
          .collection("users")
          .where("companyId", "==", cid)
          .get();

        snap.docs.forEach((d) => {
          const userData = d.data();
          const role = (userData.role || "").toLowerCase();
          if (["admin", "staff", "company_admin"].includes(role)) {
            if (d.id !== excludeUserId) {
              adminsMap.set(d.id, {
                email: userData.email || "",
                phone: userData.phoneNumber || userData.phone || userData.mobile || companyPhone || "",
                name: userData.displayName || userData.name || userData.fullName || "Admin"
              });
            }
          }
        });
      } catch (err) {
        console.warn(`sendNotificationToAdmins users query failed for ${cid}:`, err);
      }
    }

    const hasCredentials = !!(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL)
    );

    // Dispatch notification to each admin and collect diagnostic details
    const dispatchDetails: any[] = [];
    const notificationPromises = Array.from(adminsMap.entries()).map(async ([uid, info]) => {
      const detail: any = {
        uid,
        email: info.email || null,
        phone: info.phone || null,
        dbSaved: false,
        dbError: null,
        emailResult: null,
        smsResult: null
      };

      try {
        // Save to notifications collection
        await adminDb.collection("notifications").add({
          userId: uid,
          companyId: companyId ?? null,
          title: payload.title,
          message: payload.message,
          type: payload.type || "info",
          link: payload.link ?? null,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        detail.dbSaved = true;

        // Send Email
        if (info.email) {
          const res = await sendEmailNotification(uid, payload.title, payload.message, payload.link, info.email, companyId, info.name);
          detail.emailResult = res;
        } else {
          detail.emailResult = { success: false, error: "No email address found" };
        }

        // Send SMS
        if (info.phone) {
          const res = await sendSmsNotification(uid, payload.title, payload.message, info.phone, companyId, payload.link, info.name);
          detail.smsResult = res;
        } else {
          detail.smsResult = { success: false, error: "No phone number found" };
        }
      } catch (err: any) {
        detail.dbError = err.message || String(err);
        console.error(`Failed to send notification to admin ${uid}:`, err);
      }
      dispatchDetails.push(detail);
    });

    await Promise.all(notificationPromises);

    return NextResponse.json({
      success: true,
      count: adminsMap.size,
      hasAdminCredentials: hasCredentials,
      details: dispatchDetails
    });
  } catch (error: any) {
    console.error("Error in send-to-admins API route:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to process admin notifications",
        hasAdminCredentials: !!(
          process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
          (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL)
        )
      },
      { status: 500 }
    );
  }
}
