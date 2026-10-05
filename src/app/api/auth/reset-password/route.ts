import { NextResponse } from "next/server";

/**
 * This route is no longer used.
 * Password reset is now handled entirely client-side using Firebase's
 * verifyPasswordResetCode + confirmPasswordReset (no Admin SDK required).
 *
 * See: src/app/[companyId]/reset-password/page.tsx
 * And: src/app/api/auth/action/route.ts (Firebase action URL handler)
 */
export async function GET() {
  return NextResponse.json({ message: "Use the password reset page directly." }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ message: "Use the password reset page directly." }, { status: 410 });
}
