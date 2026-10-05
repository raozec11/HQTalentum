import { NextRequest, NextResponse } from "next/server";
import { sendSmsNotification } from "@/lib/sms-server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, title, message, recipientPhone, companyId, link } = body;

    if (!userId || !title || !message) {
      return NextResponse.json(
        { error: "Missing required fields (userId, title, message)" },
        { status: 400 }
      );
    }

    const result = await sendSmsNotification(userId, title, message, recipientPhone, companyId, link);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in send-sms API route:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process SMS request" },
      { status: 500 }
    );
  }
}
