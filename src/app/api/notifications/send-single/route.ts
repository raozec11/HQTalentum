import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendEmailNotification } from "@/lib/mail-server";
import { sendSmsNotification } from "@/lib/sms-server";
import admin from "firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const { userId, companyId, title, message, type, link, recipientEmail, recipientPhone } = payload;

    if (!userId || !title || !message) {
      return NextResponse.json(
        { error: "Missing required fields (userId, title, message)" },
        { status: 400 }
      );
    }

    // Suppress further notifications if booking is cancelled (the cancellation notification itself is allowed)
    const isCancellationNotification =
      title.toLowerCase().includes("cancelled") ||
      title.toLowerCase().includes("cancellation");

    if (!isCancellationNotification) {
      if (payload.bookingStatus === "Cancelled" || payload.isCancelled) {
        console.log("Suppressing notification for cancelled booking:", title);
        return NextResponse.json({ success: true, skipped: true, reason: "Booking is cancelled" });
      }

      let bookingId = payload.bookingId;
      if (!bookingId && link && typeof link === "string") {
        const match = link.match(/booking\/([a-zA-Z0-9_-]+)/) || link.match(/bookings\/([a-zA-Z0-9_-]+)/);
        if (match && match[1] && match[1] !== "all" && match[1] !== "cancelled") {
          bookingId = match[1];
        }
      }

      if (bookingId) {
        try {
          const bSnap = await adminDb.collection("bookings").doc(bookingId).get();
          if (bSnap.exists && bSnap.data()?.status === "Cancelled") {
            console.log(`Suppressing notification "${title}" for cancelled booking ${bookingId}`);
            return NextResponse.json({ success: true, skipped: true, reason: "Booking is cancelled" });
          }
        } catch (e) {
          console.warn("Error checking booking status for notification suppression:", e);
        }
      }
    }

    // 1. Save to firestore notifications collection using Admin SDK
    await adminDb.collection("notifications").add({
      userId,
      companyId: companyId ?? null,
      title,
      message,
      type: type || "info",
      link: link ?? null,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    let email = recipientEmail || "";
    let phone = recipientPhone || "";

    // 2. Suppress notification if target user/talent is inactive
    if (userId && userId !== "guest") {
      try {
        const [uSnap, tSnap] = await Promise.all([
          adminDb.collection("users").doc(userId).get(),
          adminDb.collection("talents").doc(userId).get()
        ]);
        const uData = uSnap.exists ? uSnap.data() || {} : {};
        const tData = tSnap.exists ? tSnap.data() || {} : {};

        if (uData.status === "inactive" || tData.status === "inactive") {
          console.log(`Suppressing notification "${title}" for inactive user/talent ${userId}`);
          return NextResponse.json({ success: true, skipped: true, reason: "Target user is inactive" });
        }

        if (!email) email = uData.email || tData.email || "";
        if (!phone) phone = uData.phoneNumber || uData.phone || uData.mobile || tData.phoneNumber || tData.phone || tData.mobile || "";
      } catch (dbErr) {
        console.warn(`Server email/phone lookup failed for ${userId}:`, dbErr);
      }
    }

    // EXTRA ADVANCED RESOLUTION FALLBACKS (for booking flow clients/guests/talents)
    if (!phone) {
      try {
        // Fallback A: Query bookings by clientId if valid (limit 10 and sort in memory to avoid index requirement)
        if (userId && userId !== "guest") {
          const bookingsSnap = await adminDb.collection("bookings")
            .where("clientId", "==", userId)
            .limit(10)
            .get();
          
          if (!bookingsSnap.empty) {
            const sortedDocs = bookingsSnap.docs.sort((a, b) => {
              const aTime = new Date(a.data().createdAt || 0).getTime();
              const bTime = new Date(b.data().createdAt || 0).getTime();
              return bTime - aTime;
            });
            const bData = sortedDocs[0].data() || {};
            phone = bData.clientNumber || bData.phone || bData.phoneNumber || bData.clientPhone || "";
          }
        }

        // Fallback B: If still no phone and we have an email address, search bookings for this email
        if (!phone && email) {
          let bookingsSnap = await adminDb.collection("bookings")
            .where("clientEmail", "==", email)
            .limit(10)
            .get();

          if (bookingsSnap.empty) {
            bookingsSnap = await adminDb.collection("bookings")
              .where("__email", "==", email)
              .limit(10)
              .get();
          }

          if (!bookingsSnap.empty) {
            const sortedDocs = bookingsSnap.docs.sort((a, b) => {
              const aTime = new Date(a.data().createdAt || 0).getTime();
              const bTime = new Date(b.data().createdAt || 0).getTime();
              return bTime - aTime;
            });
            const bData = sortedDocs[0].data() || {};
            phone = bData.clientNumber || bData.phone || bData.phoneNumber || bData.clientPhone || "";
          }
        }

        // Fallback C: If we have email but no phone, check talents collection by email
        if (!phone && email) {
          const talentQuery = await adminDb.collection("talents")
            .where("email", "==", email)
            .limit(1)
            .get();
          
          if (!talentQuery.empty) {
            const tData = talentQuery.docs[0].data() || {};
            phone = tData.phone || tData.phoneNumber || tData.mobile || "";
          }
        }

        // Fallback D: If we have email but no phone, check users collection by email
        if (!phone && email) {
          const userQuery = await adminDb.collection("users")
            .where("email", "==", email)
            .limit(1)
            .get();
          
          if (!userQuery.empty) {
            const uData = userQuery.docs[0].data() || {};
            phone = uData.phoneNumber || uData.phone || uData.mobile || "";
          }
        }
      } catch (fallbackErr) {
        console.warn("Advanced phone resolution fallback failed:", fallbackErr);
      }
    }

    const recipientName = payload.recipientName || payload.name || payload.clientName || payload.talentName || "";

    // 3. Send email and SMS directly on the server
    if (email) {
      try {
        await sendEmailNotification(userId, title, message, link, email, companyId, recipientName);
      } catch (err) {
        console.warn("Failed to send email notification on server:", err);
      }
    }
    if (phone) {
      try {
        await sendSmsNotification(userId, title, message, phone, companyId, link, recipientName);
      } catch (err) {
        console.warn("Failed to send SMS notification on server:", err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in send-single route:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process single notification" },
      { status: 500 }
    );
  }
}
