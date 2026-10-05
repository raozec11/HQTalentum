import { NextRequest, NextResponse } from "next/server";
import { sendMailUnified } from "@/lib/mail-server";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: "Recipient email is required." }, { status: 400 });
    }

    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM || process.env.SMTP_FROM || "Talentum <onboarding@resend.dev>";

    const hasResend = !!(resendKey && resendKey.trim().length > 0 && resendKey !== "re_your_api_key");

    if (!hasResend) {
      return NextResponse.json({
        success: false,
        error: "RESEND_API_KEY is not configured in environment variables.",
      }, { status: 400 });
    }

    console.log(`[Resend Test] Attempting to send test email to ${email}...`);

    const result = await sendMailUnified({
      from,
      to: email,
      subject: "Talentum Resend Outbound Mail Diagnostic Test Mail",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; color: #1e293b;">
          <h2 style="color: #4f46e5; margin-top: 0; font-weight: 800;">Talentum Outbound Resend Diagnostic</h2>
          <p style="font-size: 14px; line-height: 1.6;">This is a test email sent from the platform Master Settings to verify outbound Resend API delivery.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
            <b>Active Mailer:</b> Resend API<br />
            <b>Sender:</b> ${from}<br />
            <b>Timestamp:</b> ${new Date().toUTCString()}
          </p>
          <div style="margin-top: 20px; padding: 12px; background: #f0fdf4; border-left: 4px solid #16a34a; color: #15803d; border-radius: 8px; font-size: 13px; font-weight: 600;">
            ✓ Success! Outbound Resend API connections are working correctly on this server.
          </div>
        </div>
      `
    });

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
      }, { status: 500 });
    }

    console.log(`[Resend Test] ✅ Test email sent successfully: ${result.messageId}`);

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      config: { from, mailer: "Resend API" }
    });
  } catch (error: any) {
    console.error("[Resend Test] ❌ Diagnostic test failed:", error);
    return NextResponse.json({
      success: false,
      error: error.message || String(error),
    }, { status: 500 });
  }
}
