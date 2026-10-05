import { NextRequest, NextResponse } from "next/server";

/**
 * Firebase Email Action Handler
 *
 * Firebase's password reset emails contain a link to this route.
 * Configure Firebase Console → Authentication → Email Templates → Action URL
 * to: {NEXT_PUBLIC_APP_URL}/api/auth/action
 *
 * Firebase sends: /api/auth/action?mode=resetPassword&oobCode=XXX&apiKey=YYY&lang=en&continueUrl=...
 * We redirect to: /{companyId}/reset-password?oobCode=XXX
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");
  const oobCode = searchParams.get("oobCode");
  const host = request.headers.get("host") || "";
  const protocol = request.headers.get("x-forwarded-proto") || "https";
  const defaultAppUrl = host ? `${protocol}://${host}` : "https://cloud.talentumhq.com";
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || defaultAppUrl).replace(/\/$/, "");

  if (mode === "resetPassword" && oobCode) {
    // Extract companyId from the continueUrl we passed during sendOobCode
    // continueUrl is like: http://localhost:9850/companyId/reset-password
    let companyId = "";

    if (continueUrl) {
      try {
        const parsed = new URL(continueUrl);
        // Path looks like /companyId/reset-password
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parts.length >= 1) {
          companyId = parts[0];
        }
      } catch {
        // Relative path fallback: /companyId/reset-password
        const match = continueUrl.match(/^\/([^/]+)\/reset-password/);
        if (match) companyId = match[1];
      }
    }

    if (companyId) {
      const redirectTo = new URL(`${appUrl}/${companyId}/reset-password`);
      redirectTo.searchParams.set("oobCode", oobCode);
      return NextResponse.redirect(redirectTo.toString());
    }

    // Fallback: redirect without companyId (reset page will handle gracefully)
    const fallback = new URL(`${appUrl}/reset-password`);
    fallback.searchParams.set("oobCode", oobCode);
    return NextResponse.redirect(fallback.toString());
  }

  // For email verification and other modes — redirect home
  return NextResponse.redirect(new URL("/", appUrl));
}
