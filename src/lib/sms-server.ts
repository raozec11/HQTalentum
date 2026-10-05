/**
 * sms-server.ts
 * Server-only Twilio SMS notification utility.
 * Called from API routes only — never imported on the client.
 */

/**
 * Send an SMS notification via Twilio.
 *
 * @param userId         - Firestore user ID (used to look up phone number if not provided)
 * @param title          - Notification title (prepended to message)
 * @param message        - Notification body
 * @param recipientPhone - Optional pre-resolved E.164 phone number (e.g. "+15551234567")
 */
export async function sendSmsNotification(
  userId: string,
  title: string,
  message: string,
  recipientPhone?: string | null,
  companyId?: string | null,
  link?: string | null,
  recipientName?: string | null
): Promise<{ success: boolean; sid?: string; error?: string }> {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER; // E.164 e.g. +15551234567

    // Skip silently if Twilio is not configured
    if (!accountSid || !authToken || !fromNumber) {
      console.warn("Twilio credentials not configured — SMS skipped.");
      return { success: false, error: "Twilio not configured" };
    }

    if (
      accountSid === "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" ||
      authToken === "your_auth_token" ||
      fromNumber === "+1XXXXXXXXXX"
    ) {
      console.warn("Twilio credentials are placeholder values — SMS skipped.");
      return { success: false, error: "Twilio not configured (placeholder)" };
    }

    // ── Resolve phone number, name & company ID ─────────────────────────────
    let phone = recipientPhone || "";
    let name = recipientName || "";
    let resolvedCompanyId = companyId || "";

    const getBestName = (d: any): string => {
      if (!d) return "";
      return d.displayName || d.publicName || d.stageName || d.name || d.clientName || d.fullName || `${d.firstName || ''} ${d.lastName || ''}`.trim() || "";
    };

    if (!phone || !name || !resolvedCompanyId) {
      try {
        const { adminDb } = await import("@/lib/firebase-admin");

        if (userId && userId !== "guest") {
          // Check talents collection first for public stage name
          const talentSnap = await adminDb.collection("talents").doc(userId).get();
          if (talentSnap.exists) {
            const d = talentSnap.data() || {};
            if (!phone) phone = d.phoneNumber || d.phone || d.mobile || "";
            if (!name) name = getBestName(d);
            if (!resolvedCompanyId) resolvedCompanyId = d.companyId || "";
          }

          // Check users collection next
          const userSnap = await adminDb.collection("users").doc(userId).get();
          if (userSnap.exists) {
            const d = userSnap.data() || {};
            if (!phone) phone = d.phoneNumber || d.phone || d.mobile || "";
            if (!name) name = getBestName(d);
            if (!resolvedCompanyId) resolvedCompanyId = d.companyId || "";
          }
        }
      } catch (dbErr) {
        console.warn("Could not fetch info from Firestore Admin:", dbErr);
      }
    }

    if (!phone) {
      console.warn(`No phone number found for userId: ${userId} — SMS skipped.`);
      return { success: false, error: "No phone number found" };
    }

    // ── Normalise phone to E.164 ──────────────────────────────────────────────
    let digits = phone.replace(/\D/g, ""); // strip non-digits
    let toNumber = "";
    if (phone.startsWith("+")) {
      toNumber = `+${digits}`;
    } else {
      // If the number doesn't start with +, assume US (+1)
      if (digits.length === 10) {
        toNumber = `+1${digits}`;
      } else if (digits.length === 11 && digits.startsWith("1")) {
        toNumber = `+${digits}`;
      } else {
        toNumber = `+${digits}`;
      }
    }

    // ── Build SMS body with Company-Specific Login Link ───────────────────────
    const rawBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://cloud.talentumhq.com").trim();
    const baseUrl = rawBaseUrl.replace(/\/+$/, "");

    const effectiveCompanyId = String(companyId || resolvedCompanyId || "").trim().toLowerCase();

    let targetLink = "";
    if (link && typeof link === "string" && link.trim()) {
      const trimmedLink = link.trim();
      if (trimmedLink.startsWith("http://") || trimmedLink.startsWith("https://")) {
        targetLink = trimmedLink;
      } else {
        const formattedLink = trimmedLink.startsWith("/") ? trimmedLink : `/${trimmedLink}`;
        targetLink = `${baseUrl}${formattedLink}`;
      }
    } else if (effectiveCompanyId) {
      targetLink = `${baseUrl}/${effectiveCompanyId}/login`;
    } else {
      targetLink = baseUrl;
    }

    const body = `[Talentum] ${title}\n${message}\n\nLogin: ${targetLink}`;

    // ── Send via Twilio REST API (no SDK needed — avoids edge runtime issues) ─
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const form = new URLSearchParams();
    form.append("To", toNumber);
    form.append("From", fromNumber);
    form.append("Body", body);

    const response = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      console.error(`Twilio error for ${toNumber}:`, data);
      return { success: false, error: data?.message || "Twilio request failed" };
    }

    console.log(`SMS sent to ${toNumber} for user ${userId}: SID ${data.sid}`);
    return { success: true, sid: data.sid };
  } catch (error: any) {
    console.error("Failed to send SMS notification:", error);
    return { success: false, error: error.message || String(error) };
  }
}
