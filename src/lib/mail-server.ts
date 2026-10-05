import { adminDb } from "@/lib/firebase-admin";

// Unified helper to send mail via Resend API
export async function sendMailUnified(opts: { from: string; to: string; subject: string; html: string }) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || resendKey.trim().length === 0 || resendKey === "re_your_api_key") {
    return { success: false, error: "RESEND_API_KEY is not configured in environment variables." };
  }

  // Send via Resend API
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendKey.trim()}`,
      },
      body: JSON.stringify({
        from: opts.from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, messageId: data.id };
    } else {
      const errText = await res.text();
      console.error("Resend API failed:", errText);
      return { success: false, error: errText };
    }
  } catch (e: any) {
    console.error("Resend API exception:", e);
    return { success: false, error: e.message || String(e) };
  }
}

export async function sendTalentWelcomeEmail(opts: {
  talentEmail: string;
  talentName: string;
  companyName: string;
  companyId: string;
  password: string;
  verificationLink: string;
}) {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:9850";
    const loginUrl = `${appUrl}/${opts.companyId}/login`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:36px 40px;text-align:center;">
  <div style="font-size:40px;margin-bottom:12px;">🎉</div>
  <h1 style="color:#fff;margin:0;font-size:26px;font-weight:900;">Welcome to ${opts.companyName}!</h1>
  <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Your talent portal account has been created</p>
</td></tr>
<tr><td style="padding:36px 40px;">
  <p style="color:#1e293b;font-size:16px;font-weight:700;margin:0 0 6px;">Hi ${opts.talentName},</p>
  <p style="color:#64748b;font-size:14px;margin:0 0 24px;line-height:1.7;">Congratulations! You have been added to the <strong style="color:#4f46e5;">${opts.companyName}</strong> talent portal on Talentum Network. You can now log in and manage your bookings, profile, and more.</p>

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:28px;">
    <tr><td style="padding:14px 24px;border-bottom:1px solid #e2e8f0;background:#f1f5f9;">
      <span style="font-size:11px;font-weight:900;letter-spacing:0.08em;color:#64748b;text-transform:uppercase;">Your Login Details</span>
    </td></tr>
    <tr><td style="padding:20px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;">Email<span style="float:right;color:#1e293b;font-weight:800;">${opts.talentEmail}</span></td></tr>
        <tr><td style="padding:8px 0;font-size:13px;color:#64748b;">Temporary Password<span style="float:right;color:#4f46e5;font-weight:800;font-family:monospace;">${opts.password}</span></td></tr>
      </table>
    </td></tr>
  </table>

  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px 20px;margin-bottom:28px;">
    <p style="color:#c2410c;font-size:13px;font-weight:800;margin:0 0 4px;">⚠️ Action Required: Verify Your Email</p>
    <p style="color:#9a3412;font-size:13px;margin:0;line-height:1.6;">Your portal access will be <strong>locked</strong> until you verify your email address. Please click the button below to verify and unlock your account.</p>
  </div>

  <div style="text-align:center;margin:28px 0;">
    <a href="${opts.verificationLink}" style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:800;font-size:15px;display:inline-block;box-shadow:0 4px 14px rgba(79,70,229,0.35);">
      ✅ Verify Email &amp; Activate Portal
    </a>
  </div>

  <p style="color:#94a3b8;font-size:12px;text-align:center;margin-bottom:20px;">After verifying, log in here: <a href="${loginUrl}" style="color:#4f46e5;">${loginUrl}</a></p>

  <p style="font-size:12px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:20px;">If the button does not work, copy and paste this URL into your browser:<br/>
  <a href="${opts.verificationLink}" style="color:#4f46e5;word-break:break-all;">${opts.verificationLink}</a></p>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
  <p style="color:#94a3b8;font-size:11px;margin:0;">This is an automated message from Talentum Network. Please do not reply to this email.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const fromName = process.env.RESEND_FROM || "Talentum <onboarding@resend.dev>";
    const info = await sendMailUnified({
      from: fromName,
      to: opts.talentEmail,
      subject: `[Talentum] Welcome to ${opts.companyName} — Verify your email to get started`,
      html,
    });

    if (info.success) {
      console.log(`Talent welcome email sent to ${opts.talentEmail}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } else {
      return { success: false, error: info.error };
    }
  } catch (error: any) {
    console.error("Failed to send talent welcome email:", error);
    return { success: false, error: error.message || error };
  }
}

export async function sendEmailNotification(
  userId: string,
  title: string,
  message: string,
  link?: string | null,
  recipientEmail?: string | null,
  companyId?: string | null,
  recipientName?: string | null
) {
  try {
    // 1. Fetch user email & resolve exact public/client name
    let email = recipientEmail || "";
    let name = recipientName || "";

    const getBestName = (d: any): string => {
      if (!d) return "";
      return d.displayName || d.publicName || d.stageName || d.name || d.clientName || d.fullName || `${d.firstName || ''} ${d.lastName || ''}`.trim() || "";
    };

    // If name is not provided, perform thorough database lookup
    if (!name && userId && userId !== "guest") {
      try {
        // Try talents collection first to capture talent's public stage name
        const talentSnap = await adminDb.collection("talents").doc(userId).get();
        if (talentSnap.exists) {
          const t = talentSnap.data() || {};
          if (!email) email = t.email || "";
          name = getBestName(t);
        }

        // Try users collection next
        const userSnap = await adminDb.collection("users").doc(userId).get();
        if (userSnap.exists) {
          const u = userSnap.data() || {};
          if (!email) email = u.email || "";
          if (!name) name = getBestName(u);
        }
      } catch (dbErr) {
        console.warn("Could not fetch user/talent details via Firestore Admin:", dbErr);
      }
    }

    // Fallback: if name is still missing and email is present, query by email
    if (!name && email) {
      try {
        const tQuery = await adminDb.collection("talents").where("email", "==", email).limit(1).get();
        if (!tQuery.empty) {
          name = getBestName(tQuery.docs[0].data());
        } else {
          const uQuery = await adminDb.collection("users").where("email", "==", email).limit(1).get();
          if (!uQuery.empty) {
            name = getBestName(uQuery.docs[0].data());
          }
        }
      } catch (e) {}
    }

    // Replace generic fallback placeholders with friendly greeting
    if (!name || name === "User" || name === "Talent" || name === "Client") {
      name = "There";
    }

    if (!email) {
      console.warn(`No email address found for userId: ${userId}. Skipping email notification.`);
      return { success: false, error: "No email address found" };
    }

    // 2. Resolve booking details if bookingId is in the link
    let bookingHtml = "";
    let loginUrl = "";
    
    // Match booking/[id] or bookingId=[id]
    const bookingMatch = link?.match(/(?:booking\/|bookingId=)([a-zA-Z0-9]+)/);
    const bookingId = bookingMatch ? bookingMatch[1] : null;

    if (bookingId) {
      try {
        const bookingSnap = await adminDb.collection("bookings").doc(bookingId).get();
        if (bookingSnap.exists) {
          const bookingData = bookingSnap.data() || {};
          const eventDate = bookingData.eventDate || "";
          const eventTime = bookingData.eventTime || "";
          const payRate = bookingData.payRate || "";
          const address = bookingData.address || "";
          const city = bookingData.city || "";
          const state = bookingData.state || "";
          const resolvedCompId = bookingData.companyId || companyId || "";

          // Formatted date and time
          let formattedDate = eventDate;
          let formattedTime = eventTime;
          try {
            if (eventDate) {
              formattedDate = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(eventDate));
            }
            if (eventTime) {
              formattedTime = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(`2000-01-01T${eventTime}`));
            }
          } catch (e) {}

          const fullLocation = `${address}${city || state ? `, ${city}, ${state}` : ""}`;
          
          if (resolvedCompId) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cloud.talentumhq.com";
            loginUrl = `${appUrl}/${resolvedCompId.toLowerCase()}/login`;
          }

          bookingHtml = `
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; margin-top:24px; margin-bottom:24px; overflow:hidden; border-collapse:separate; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
              <tr>
                <td style="padding:14px 24px; border-bottom:1px solid #e2e8f0; background:#f1f5f9;">
                  <span style="font-size:11px; font-weight:900; letter-spacing:0.08em; color:#4f46e5; text-transform:uppercase;">Booking Details</span>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px; color:#475569; line-height:1.5;">
                    <tr>
                      <td style="padding:8px 0; border-bottom:1px solid #f1f5f9; font-weight:600; color:#64748b;">Date</td>
                      <td style="padding:8px 0; border-bottom:1px solid #f1f5f9; text-align:right; font-weight:700; color:#0f172a;">${formattedDate}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0; border-bottom:1px solid #f1f5f9; font-weight:600; color:#64748b;">Time</td>
                      <td style="padding:8px 0; border-bottom:1px solid #f1f5f9; text-align:right; font-weight:700; color:#0f172a;">${formattedTime}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0; border-bottom:1px solid #f1f5f9; font-weight:600; color:#64748b;">Location</td>
                      <td style="padding:8px 0; border-bottom:1px solid #f1f5f9; text-align:right; font-weight:700; color:#0f172a; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${fullLocation}">${fullLocation}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0; font-weight:600; color:#64748b;">Pay Rate</td>
                      <td style="padding:8px 0; text-align:right; font-weight:900; color:#059669; font-size:15px;">$${payRate}/hr</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          `;
        }
      } catch (dbErr) {
        console.warn("Failed to fetch booking details for email:", dbErr);
      }
    }

    if (!loginUrl && companyId) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cloud.talentumhq.com";
      loginUrl = `${appUrl}/${companyId.toLowerCase()}/login`;
    }

    // 3. Build template
    const appLink = link ? `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:9850"}${link}` : null;
    
    // Parse proposed terms from message if present
    let proposalHtml = "";
    let cleanMessage = message;

    if (message.includes("Proposed Date:") || message.includes("Proposed Time:") || message.includes("Proposed Pay Rate:")) {
      const lines = message.split("\n");
      const remainingLines: string[] = [];
      const proposedDetails: { key: string; newVal: string; origVal: string }[] = [];

      for (const line of lines) {
        if (line.includes("Proposed Date:") || line.includes("Proposed Time:") || line.includes("Proposed Pay Rate:")) {
          const colonIndex = line.indexOf(":");
          if (colonIndex !== -1) {
            const key = line.substring(0, colonIndex).trim();
            const rest = line.substring(colonIndex + 1).trim();
            
            let newVal = rest;
            let origVal = "";
            const origMatch = rest.match(/(.*?)\s*\(original:\s*(.*?)\)/);
            if (origMatch) {
              newVal = origMatch[1].trim();
              origVal = origMatch[2].trim();
            }
            proposedDetails.push({ key, newVal, origVal });
          }
        } else {
          remainingLines.push(line);
        }
      }
      
      cleanMessage = remainingLines.join("\n");

      if (proposedDetails.length > 0) {
        let rowsHtml = "";
        for (const detail of proposedDetails) {
          const label = detail.key.replace("Proposed ", "");
          const origHtml = detail.origVal 
            ? `<span style="text-decoration: line-through; color: #94a3b8; font-size: 12px; margin-right: 8px;">${detail.origVal}</span>` 
            : "";
          const isRate = label.toLowerCase().includes("rate");
          const valColor = isRate ? "#059669" : "#d97706";
          
          rowsHtml += `
            <tr>
              <td style="padding:10px 0; border-bottom:1px solid #fde68a; font-weight:600; color:#b45309;">${label}</td>
              <td style="padding:10px 0; border-bottom:1px solid #fde68a; text-align:right; font-weight:700;">
                ${origHtml}
                <span style="color:${valColor}; font-weight:850;">${detail.newVal}</span>
              </td>
            </tr>
          `;
        }

        proposalHtml = `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb; border:1px solid #fde68a; border-left: 4px solid #d97706; border-radius:16px; margin-top:20px; margin-bottom:20px; overflow:hidden; border-collapse:separate; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
            <tr>
              <td style="padding:14px 24px; border-bottom:1px solid #fde68a; background:#fef3c7;">
                <span style="font-size:11px; font-weight:900; letter-spacing:0.08em; color:#b45309; text-transform:uppercase;">Proposed Custom Terms</span>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px; color:#78350f; line-height:1.5;">
                  ${rowsHtml}
                </table>
              </td>
            </tr>
          </table>
        `;
      }
    }

    const formattedMessage = cleanMessage.replace(/\n/g, "<br />");
    const isGuest = !userId || userId === "guest" || String(userId).startsWith("guest_") || (link && link.includes("/guest/"));
    
    let buttonText = "View in Dashboard";
    if (title.toLowerCase().includes("invoice") || link?.includes("/payment/")) {
      buttonText = "Pay Invoice";
    } else if (title.toLowerCase().includes("unavailable")) {
      buttonText = isGuest ? "Select Another Talent" : "View Booking";
    } else if (isGuest || link?.includes("/guest/")) {
      buttonText = "View Booking Details";
    }
    
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);">
        <div style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); padding: 32px; text-align: center; border-radius: 14px 14px 0 0;">
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">Talentum Notification</h1>
        </div>
        <div style="padding: 24px 8px 12px 8px; color: #1e293b; line-height: 1.6;">
          <p style="font-size: 16px; font-weight: 700; margin-top: 0; color: #0f172a;">Hi ${name},</p>
          <p style="font-size: 14px; margin-bottom: 20px; color: #475569; font-weight: 500;">You have a new update on Talentum:</p>
          <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 18px; margin-bottom: 20px; border-radius: 6px 12px 12px 6px; border-top: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9;">
            <h3 style="margin: 0 0 10px 0; color: #4f46e5; font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">${title}</h3>
            <p style="margin: 0; color: #334155; font-size: 14px; font-weight: 500; line-height: 1.6;">${formattedMessage}</p>
          </div>
          ${proposalHtml}
          ${bookingHtml}
          ${
            appLink
              ? `<div style="text-align: center; margin-top: 32px; margin-bottom: 24px;">
                  <a href="${appLink}" style="background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.25); margin-right: 12px; margin-bottom: 12px;">
                    ${buttonText}
                  </a>
                  ${(!isGuest && loginUrl) ? `
                  <a href="${loginUrl}" style="background-color: #ffffff; border: 1.5px solid #cbd5e1; color: #475569; text-decoration: none; padding: 12.5px 28px; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block; margin-bottom: 12px;">
                    Login Dashboard
                  </a>
                  ` : ""}
                 </div>`
              : ""
          }
        </div>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 24px; text-align: center; font-size: 12px; color: #94a3b8; font-weight: 500;">
          <p style="margin: 0;">This is an automated notification from Talentum Network.</p>
          <p style="margin: 6px 0 0 0;">Please do not reply directly to this email.</p>
        </div>
     `;

    const fromName = process.env.RESEND_FROM || process.env.SMTP_FROM || "Talentum <onboarding@resend.dev>";

    const info = await sendMailUnified({
      from: fromName,
      to: email,
      subject: `[Talentum] ${title}`,
      html,
    });

    if (info.success) {
      console.log(`Email sent to ${email} for user ${userId}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } else {
      return { success: false, error: info.error };
    }
  } catch (error: any) {
    console.error("Failed to send email notification:", error);
    return { success: false, error: error.message || error };
  }
}

export async function sendActivationEmail(
  companyId: string,
  companyName: string,
  recipientEmail: string,
  contactName: string,
  activationToken: string
) {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:9850";
    const activationLink = `${appUrl}/activate-trial?companyId=${companyId}&token=${activationToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
        <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px; text-align: center; border-radius: 16px 16px 0 0;">
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">Welcome to Talentum</h1>
        </div>
        <div style="padding: 32px; color: #1e293b; line-height: 1.6;">
          <p style="font-size: 16px; font-weight: bold; margin-top: 0; color: #0f172a;">Hi ${contactName},</p>
          <p style="font-size: 15px; color: #475569;">Congratulations! Your agency workspace <strong>${companyName}</strong> (slug: <code>${companyId}</code>) is ready for deployment.</p>
          <p style="font-size: 15px; color: #475569; margin-bottom: 24px;">To complete your setup and activate your <strong>7-Day Free Trial</strong>, please verify your email address by clicking the link below:</p>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="${activationLink}" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 800; font-size: 15px; display: inline-block; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);">
              Activate 7-Day Free Trial
            </a>
          </div>
          
          <p style="font-size: 13px; color: #94a3b8; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 20px;">
            If the button above does not work, copy and paste this URL into your browser:
            <br />
            <a href="${activationLink}" style="color: #4f46e5; text-decoration: underline; word-break: break-all;">${activationLink}</a>
          </p>
        </div>
        <div style="border-top: 1px solid #e2e8f0; padding: 24px; text-align: center; font-size: 11px; color: #94a3b8; font-weight: 500;">
          <p style="margin: 0;">This is an automated notification from Talentum Network.</p>
          <p style="margin: 5px 0 0 0;">Please do not reply directly to this email.</p>
        </div>
      </div>
    `;

    const fromName = process.env.RESEND_FROM || process.env.SMTP_FROM || "Talentum <onboarding@resend.dev>";

    const info = await sendMailUnified({
      from: fromName,
      to: recipientEmail,
      subject: `[Talentum] Activate your 7-Day Free Trial - ${companyName}`,
      html,
    });

    if (info.success) {
      console.log(`Activation email sent to ${recipientEmail} for company ${companyId}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } else {
      return { success: false, error: info.error };
    }
  } catch (error: any) {
    console.error("Failed to send activation email:", error);
    return { success: false, error: error.message || error };
  }
}

export async function sendPasswordResetEmail(
  companyId: string,
  companyName: string,
  recipientEmail: string,
  resetLink: string
) {
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
        <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px; text-align: center; border-radius: 16px 16px 0 0;">
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">Password Reset Request</h1>
        </div>
        <div style="padding: 32px; color: #1e293b; line-height: 1.6;">
          <p style="font-size: 16px; font-weight: bold; margin-top: 0; color: #0f172a;">Hello,</p>
          <p style="font-size: 15px; color: #475569;">We received a request to reset the password for your account in the workspace <strong>${companyName}</strong> (slug: <code>${companyId}</code>).</p>
          <p style="font-size: 15px; color: #475569; margin-bottom: 24px;">Click the button below to set a new password. <strong>Note: This link will expire in 3 hours.</strong></p>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetLink}" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 800; font-size: 15px; display: inline-block; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);">
              Reset Password
            </a>
          </div>
          
          <p style="font-size: 13px; color: #94a3b8; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 20px;">
            If you did not request a password reset, you can safely ignore this email.
            <br /><br />
            If the button above does not work, copy and paste this URL into your browser:
            <br />
            <a href="${resetLink}" style="color: #4f46e5; text-decoration: underline; word-break: break-all;">${resetLink}</a>
          </p>
        </div>
        <div style="border-top: 1px solid #e2e8f0; padding: 24px; text-align: center; font-size: 11px; color: #94a3b8; font-weight: 500;">
          <p style="margin: 0;">This is an automated notification from Talentum Network.</p>
        </div>
      </div>
    `;

    const fromName = process.env.RESEND_FROM || process.env.SMTP_FROM || "Talentum <onboarding@resend.dev>";

    const info = await sendMailUnified({
      from: fromName,
      to: recipientEmail,
      subject: `[Talentum] Reset your password - ${companyName}`,
      html,
    });

    if (info.success) {
      console.log(`Password reset email sent to ${recipientEmail} for company ${companyId}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } else {
      return { success: false, error: info.error };
    }
  } catch (error: any) {
    console.error("Failed to send password reset email:", error);
    return { success: false, error: error.message || error };
  }
}


export async function sendSubscriptionConfirmationEmail(opts: {
  recipientEmail: string;
  recipientName: string;
  companyId: string;
  companyName: string;
  planName: string;
  amount: number;
  nextBillingDate: string;
  activatedAt: string;
  dashboardLink: string;
}) {
  try {
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:36px 40px;text-align:center;">
  <div style="font-size:36px;margin-bottom:12px;">&#127881;</div>
  <h1 style="color:#fff;margin:0;font-size:26px;font-weight:900;">Subscription Activated!</h1>
  <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Your workspace is now fully active</p>
</td></tr>
<tr><td style="padding:36px 40px;">
  <p style="color:#1e293b;font-size:16px;font-weight:700;margin:0 0 6px;">Hi ${opts.recipientName},</p>
  <p style="color:#64748b;font-size:14px;margin:0 0 28px;line-height:1.6;">Great news! Your payment was successfully processed and your <strong style="color:#4f46e5;">${opts.companyName}</strong> workspace subscription is now active.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:24px;">
    <tr><td style="padding:14px 24px;border-bottom:1px solid #e2e8f0;background:#f1f5f9;">
      <span style="font-size:11px;font-weight:900;letter-spacing:0.08em;color:#64748b;text-transform:uppercase;">Payment Receipt</span>
    </td></tr>
    <tr><td style="padding:20px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:9px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;">Plan<span style="float:right;color:#1e293b;font-weight:800;">${opts.planName} Plan</span></td></tr>
        <tr><td style="padding:9px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;">Amount Paid<span style="float:right;color:#059669;font-size:15px;font-weight:900;">$${opts.amount.toFixed(2)}</span></td></tr>
        <tr><td style="padding:9px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;">Activated On<span style="float:right;color:#1e293b;font-weight:700;">${opts.activatedAt}</span></td></tr>
        <tr><td style="padding:9px 0;font-size:13px;color:#64748b;">Next Billing Date<span style="float:right;color:#4f46e5;font-weight:800;">${opts.nextBillingDate}</span></td></tr>
      </table>
    </td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;margin-bottom:28px;">
    <tr><td style="padding:16px 20px;text-align:center;">
      <span style="color:#065f46;font-size:13px;font-weight:800;">Workspace Status: &nbsp;</span>
      <span style="background:#059669;color:#fff;font-size:11px;font-weight:900;padding:3px 14px;border-radius:100px;">ACTIVE</span>
    </td></tr>
  </table>
  <div style="text-align:center;margin-bottom:28px;">
    <a href="${opts.dashboardLink}" style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:800;font-size:15px;display:inline-block;box-shadow:0 4px 14px rgba(79,70,229,0.35);">
      Go to Dashboard &rarr;
    </a>
  </div>
  <p style="color:#94a3b8;font-size:12px;text-align:center;">View billing history: Dashboard &rarr; Subscription &amp; Billing</p>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
  <p style="color:#94a3b8;font-size:11px;margin:0;">This is an automated receipt from Talentum Network. Please do not reply to this email.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const fromName = process.env.RESEND_FROM || process.env.SMTP_FROM || "Talentum <onboarding@resend.dev>";
    const info = await sendMailUnified({
      from: fromName,
      to: opts.recipientEmail,
      subject: `[Talentum] ✅ Subscription Activated — ${opts.planName} Plan ($${opts.amount.toFixed(2)})`,
      html,
    });
    if (info.success) {
      console.log(`Subscription confirmation email sent to ${opts.recipientEmail} for company ${opts.companyId}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } else {
      console.error("Failed to send subscription confirmation email:", info.error);
      return { success: false, error: info.error };
    }
  } catch (error: any) {
    console.error("sendSubscriptionConfirmationEmail error:", error);
    return { success: false, error: error.message || String(error) };
  }
}

export async function sendVerificationOnlyEmail(opts: {
  email: string;
  name: string;
  companyName: string;
  companyId: string;
  verificationLink: string;
}) {
  try {
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:36px 40px;text-align:center;">
  <div style="font-size:40px;margin-bottom:12px;">🛡️</div>
  <h1 style="color:#fff;margin:0;font-size:26px;font-weight:900;">Verify Your Email</h1>
  <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Talentum Network Account Security</p>
</td></tr>
<tr><td style="padding:36px 40px;">
  <p style="color:#1e293b;font-size:16px;font-weight:700;margin:0 0 6px;">Hi ${opts.name},</p>
  <p style="color:#64748b;font-size:14px;margin:0 0 24px;line-height:1.7;">Please verify your email address to unlock and activate your talent profile for <strong style="color:#4f46e5;">${opts.companyName}</strong>.</p>

  <div style="text-align:center;margin:28px 0;">
    <a href="${opts.verificationLink}" style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:800;font-size:15px;display:inline-block;box-shadow:0 4px 14px rgba(79,70,229,0.35);">
      ✅ Verify Email Address
    </a>
  </div>

  <p style="font-size:12px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:20px;">If the button above does not work, copy and paste this URL into your browser:<br/>
  <a href="${opts.verificationLink}" style="color:#4f46e5;word-break:break-all;">${opts.verificationLink}</a></p>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
  <p style="color:#94a3b8;font-size:11px;margin:0;">This is an automated message from Talentum Network. Please do not reply to this email.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const fromName = process.env.RESEND_FROM || "Talentum <onboarding@resend.dev>";
    const info = await sendMailUnified({
      from: fromName,
      to: opts.email,
      subject: `[Talentum] Verify your email for ${opts.companyName}`,
      html,
    });

    if (info.success) {
      console.log(`Verification email sent to ${opts.email}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } else {
      return { success: false, error: info.error };
    }
  } catch (error: any) {
    console.error("Failed to send verification email:", error);
    return { success: false, error: error.message || error };
  }
}

export async function sendEmailChangedOldAlert(opts: {
  oldEmail: string;
  newEmail: string;
  name: string;
  companyName: string;
}) {
  try {
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#e11d48 0%,#be123c 100%);padding:36px 40px;text-align:center;">
  <div style="font-size:40px;margin-bottom:12px;">⚠️</div>
  <h1 style="color:#fff;margin:0;font-size:24px;font-weight:900;">Security Alert: Email Address Changed</h1>
  <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Talentum Account Notification</p>
</td></tr>
<tr><td style="padding:36px 40px;">
  <p style="color:#1e293b;font-size:16px;font-weight:700;margin:0 0 6px;">Hi ${opts.name || "User"},</p>
  <p style="color:#64748b;font-size:14px;margin:0 0 20px;line-height:1.7;">
    The email address for your account at <strong style="color:#1e293b;">${opts.companyName}</strong> was recently changed from <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;color:#e11d48;">${opts.oldEmail}</code> to <strong style="color:#4f46e5;">${opts.newEmail}</strong>.
  </p>
  <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
    <p style="color:#9f1239;font-size:13px;font-weight:800;margin:0 0 4px;">Didn't request this change?</p>
    <p style="color:#be123c;font-size:13px;margin:0;line-height:1.6;">If you did not authorize this update, please contact support immediately to secure your account.</p>
  </div>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
  <p style="color:#94a3b8;font-size:11px;margin:0;">This is an automated security alert from Talentum Network.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const fromName = process.env.RESEND_FROM || "Talentum <onboarding@resend.dev>";
    return await sendMailUnified({
      from: fromName,
      to: opts.oldEmail,
      subject: `[Talentum Security Alert] Your account email was changed to ${opts.newEmail}`,
      html,
    });
  } catch (err: any) {
    console.error("Failed to send old email security alert:", err);
    return { success: false, error: err.message };
  }
}

export async function sendEmailChangedNewVerify(opts: {
  newEmail: string;
  name: string;
  companyName: string;
  companyId: string;
  verificationLink: string;
}) {
  try {
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:36px 40px;text-align:center;">
  <div style="font-size:40px;margin-bottom:12px;">✉️</div>
  <h1 style="color:#fff;margin:0;font-size:26px;font-weight:900;">Verify Your New Email Address</h1>
  <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Talentum Account Email Update</p>
</td></tr>
<tr><td style="padding:36px 40px;">
  <p style="color:#1e293b;font-size:16px;font-weight:700;margin:0 0 6px;">Hi ${opts.name || "User"},</p>
  <p style="color:#64748b;font-size:14px;margin:0 0 24px;line-height:1.7;">This email address (<strong style="color:#4f46e5;">${opts.newEmail}</strong>) has been linked to your <strong style="color:#1e293b;">${opts.companyName}</strong> account. Please click the button below to verify and confirm this email address.</p>

  <div style="text-align:center;margin:28px 0;">
    <a href="${opts.verificationLink}" style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:800;font-size:15px;display:inline-block;box-shadow:0 4px 14px rgba(79,70,229,0.35);">
      ✅ Verify New Email Address
    </a>
  </div>

  <p style="font-size:12px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:20px;">If the button above does not work, copy and paste this URL into your browser:<br/>
  <a href="${opts.verificationLink}" style="color:#4f46e5;word-break:break-all;">${opts.verificationLink}</a></p>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
  <p style="color:#94a3b8;font-size:11px;margin:0;">This is an automated message from Talentum Network. Please do not reply to this email.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const fromName = process.env.RESEND_FROM || "Talentum <onboarding@resend.dev>";
    return await sendMailUnified({
      from: fromName,
      to: opts.newEmail,
      subject: `[Talentum] Verify your new email address for ${opts.companyName}`,
      html,
    });
  } catch (err: any) {
    console.error("Failed to send new email verification link:", err);
    return { success: false, error: err.message };
  }
}
