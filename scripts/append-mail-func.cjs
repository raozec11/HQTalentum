const fs = require("fs");
const path = "f:/WEB APPS/COMPANY/Talentum/src/lib/mail-server.ts";

const newFunction = `
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
    const html = \`<!DOCTYPE html>
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
  <p style="color:#1e293b;font-size:16px;font-weight:700;margin:0 0 6px;">Hi \${opts.recipientName},</p>
  <p style="color:#64748b;font-size:14px;margin:0 0 28px;line-height:1.6;">Great news! Your payment was successfully processed and your <strong style="color:#4f46e5;">\${opts.companyName}</strong> workspace subscription is now active.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:24px;">
    <tr><td style="padding:14px 24px;border-bottom:1px solid #e2e8f0;background:#f1f5f9;">
      <span style="font-size:11px;font-weight:900;letter-spacing:0.08em;color:#64748b;text-transform:uppercase;">Payment Receipt</span>
    </td></tr>
    <tr><td style="padding:20px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:9px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;">Plan<span style="float:right;color:#1e293b;font-weight:800;">\${opts.planName} Plan</span></td></tr>
        <tr><td style="padding:9px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;">Amount Paid<span style="float:right;color:#059669;font-size:15px;font-weight:900;">$\${opts.amount.toFixed(2)}</span></td></tr>
        <tr><td style="padding:9px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;">Activated On<span style="float:right;color:#1e293b;font-weight:700;">\${opts.activatedAt}</span></td></tr>
        <tr><td style="padding:9px 0;font-size:13px;color:#64748b;">Next Billing Date<span style="float:right;color:#4f46e5;font-weight:800;">\${opts.nextBillingDate}</span></td></tr>
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
    <a href="\${opts.dashboardLink}" style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:800;font-size:15px;display:inline-block;box-shadow:0 4px 14px rgba(79,70,229,0.35);">
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
</html>\`;

    const fromName = process.env.RESEND_FROM || process.env.SMTP_FROM || "Talentum <onboarding@resend.dev>";
    const info = await sendMailUnified({
      from: fromName,
      to: opts.recipientEmail,
      subject: \`[Talentum] ✅ Subscription Activated — \${opts.planName} Plan ($\${opts.amount.toFixed(2)})\`,
      html,
    });
    if (info.success) {
      console.log(\`Subscription confirmation email sent to \${opts.recipientEmail} for company \${opts.companyId}: \${info.messageId}\`);
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
`;

fs.appendFileSync(path, newFunction, "utf8");
console.log("Done! New file size:", fs.statSync(path).size, "bytes");
