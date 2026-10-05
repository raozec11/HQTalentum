import { NextRequest, NextResponse } from "next/server";
import { admin, hasAdminCredentials } from "@/lib/firebase-admin";
import { sendMailUnified } from "@/lib/mail-server";

function isEmailConfigured() {
  const hasResend = !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim() !== "re_your_api_key");
  const hasSmtp = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  return hasResend || hasSmtp;
}

function buildResetEmail(opts: {
  email: string;
  companyId: string;
  resetLink: string;
  hasLink: boolean;
}) {
  const { email, companyId, resetLink, hasLink } = opts;
  const workspaceName = companyId.charAt(0).toUpperCase() + companyId.slice(1);

  const buttonSection = hasLink
    ? `
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetLink}"
           style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; border-radius: 12px; letter-spacing: 0.3px; box-shadow: 0 8px 24px rgba(79,70,229,0.35);">
          Reset My Password &rarr;
        </a>
      </div>
      <p style="font-size: 13px; color: #94a3b8; text-align: center; margin: 0 0 16px 0;">
        Or copy and paste this link into your browser:
      </p>
      <p style="font-size: 12px; color: #64748b; word-break: break-all; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
        ${resetLink}
      </p>`
    : `
      <p style="font-size: 15px; color: #475569;">
        A secure password reset link has been sent to your inbox in a separate email.
        <strong>Click the link in that email to set your new password.</strong>
      </p>`;

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
      <div style="max-width: 600px; margin: 40px auto; padding: 20px;">
        <!-- Card -->
        <div style="background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 30px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">

          <!-- Header -->
          <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 40px 32px; text-align: center;">
            <div style="display: inline-block; background: rgba(255,255,255,0.15); border-radius: 16px; padding: 12px 20px; margin-bottom: 16px;">
              <span style="color: #ffffff; font-size: 28px; font-weight: 900; letter-spacing: -0.5px;">🔐 Talentum</span>
            </div>
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800;">Password Reset Request</h1>
            <p style="color: rgba(255,255,255,0.75); margin: 8px 0 0; font-size: 13px; text-transform: uppercase; letter-spacing: 2px;">
              ${workspaceName} Workspace
            </p>
          </div>

          <!-- Body -->
          <div style="padding: 40px 32px;">
            <p style="font-size: 16px; font-weight: 600; color: #0f172a; margin: 0 0 12px;">Hello,</p>
            <p style="font-size: 15px; color: #475569; margin: 0 0 20px; line-height: 1.6;">
              We received a request to reset the password for <strong>${email}</strong> in the
              <strong>${workspaceName}</strong> workspace.
            </p>

            ${buttonSection}

            <!-- Warning box -->
            <div style="background: #fefce8; border-left: 4px solid #eab308; padding: 14px 18px; border-radius: 4px 10px 10px 4px; margin: 28px 0 0;">
              <p style="margin: 0; font-size: 13px; color: #854d0e; line-height: 1.5;">
                ⏱ <strong>This link expires in 1 hour.</strong> If you did not request a password reset, you can safely ignore this email — your password will not change.
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="background: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; font-size: 12px; color: #94a3b8;">
              This is an automated message from <strong>Talentum Network</strong>. Please do not reply to this email.
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function POST(request: NextRequest) {
  try {
    const { email, companyId } = await request.json();
    if (!email || !companyId) {
      return NextResponse.json({ error: "Email and company ID are required." }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCompanyId = companyId.trim().toLowerCase();
    const host = request.headers.get("host") || "";
    const protocol = request.headers.get("x-forwarded-proto") || "https";
    const defaultAppUrl = host ? `${protocol}://${host}` : "https://cloud.talentumhq.com";
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || defaultAppUrl).replace(/\/$/, "");

    // ── APPROACH A: Admin SDK available → generate link ourselves, send ONE branded email ──
    if (hasAdminCredentials) {
      console.log("[ForgotPw] Admin SDK available — generating reset link directly.");
      let resetLink: string;
      try {
        // generatePasswordResetLink gets the Firebase oobCode link WITHOUT Firebase sending any email
        resetLink = await admin.auth().generatePasswordResetLink(cleanEmail, {
          url: `${appUrl}/${cleanCompanyId}/reset-password`,
          handleCodeInApp: false,
        });

        // Transform the Firebase link to go through our action handler
        // so user lands on our beautiful reset page instead of Firebase's default
        const fbUrl = new URL(resetLink);
        const oobCode = fbUrl.searchParams.get("oobCode") || "";
        const ourResetLink = `${appUrl}/api/auth/action?mode=resetPassword&oobCode=${oobCode}&continueUrl=${encodeURIComponent(`${appUrl}/${cleanCompanyId}/reset-password`)}`;

        if (!isEmailConfigured()) {
          console.error("[ForgotPw] Neither Resend API nor SMTP is configured. Cannot send email.");
          return NextResponse.json({ error: "Email service not configured." }, { status: 500 });
        }

        const emailResult = await sendMailUnified({
          from: process.env.RESEND_FROM || process.env.SMTP_FROM || "Talentum <onboarding@resend.dev>",
          to: cleanEmail,
          subject: `[${cleanCompanyId}] Reset your Talentum password`,
          html: buildResetEmail({ email: cleanEmail, companyId: cleanCompanyId, resetLink: ourResetLink, hasLink: true }),
        });

        if (!emailResult.success) {
          console.error("[ForgotPw] Failed to send reset email:", emailResult.error);
          return NextResponse.json({ error: "Failed to send reset email. Please try again." }, { status: 500 });
        }

        console.log(`[ForgotPw] ✅ Branded reset email sent to ${cleanEmail} via Unified Mailer.`);
      } catch (err: any) {
        const code = err?.code || err?.errorInfo?.code || "";
        // Email not in Firebase Auth — still return success (no enumeration)
        if (code.includes("user-not-found") || code.includes("EMAIL_NOT_FOUND")) {
          console.log(`[ForgotPw] Email ${cleanEmail} not found in Firebase Auth — returning success silently.`);
        } else {
          console.error("[ForgotPw] Admin generatePasswordResetLink error:", err);
          return NextResponse.json({ error: "Failed to send reset email. Please try again." }, { status: 500 });
        }
      }

      return NextResponse.json({
        success: true,
        message: "If an account matches this email, a password reset link has been sent.",
      });
    }

    // ── APPROACH B: No Admin SDK → Firebase sends its own email, we send notification ──
    console.log("[ForgotPw] No Admin SDK — using Firebase REST sendOobCode.");
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const continueUrl = `${appUrl}/${cleanCompanyId}/reset-password`;

    const fbRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType: "PASSWORD_RESET", email: cleanEmail, continueUrl }),
      }
    );

    if (!fbRes.ok) {
      const err = await fbRes.json().catch(() => ({}));
      const msg = (err?.error?.message || "");
      console.error("[ForgotPw] Firebase sendOobCode error:", msg, err);
      if (!msg.toUpperCase().includes("EMAIL_NOT_FOUND") && !msg.toUpperCase().includes("INVALID_EMAIL")) {
        return NextResponse.json({ error: `Firebase Error: ${msg || "Failed to send reset email. Please try again later."}` }, { status: 500 });
      }
    } else {
      console.log(`[ForgotPw] Firebase sent OOB code to ${cleanEmail}`);
    }

    return NextResponse.json({
      success: true,
      message: "If an account matches this email, a password reset link has been sent.",
    });
  } catch (error: any) {
    console.error("[ForgotPw] Unexpected error:", error);
    return NextResponse.json({ error: "An unexpected error occurred. Please try again." }, { status: 500 });
  }
}
