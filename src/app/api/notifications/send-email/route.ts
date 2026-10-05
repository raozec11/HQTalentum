import { NextRequest, NextResponse } from "next/server";
import { sendEmailNotification } from "@/lib/mail-server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, title, message, link, recipientEmail } = body;

    if (!userId || !title || !message) {
      return NextResponse.json(
        { error: "Missing required fields (userId, title, message)" },
        { status: 400 }
      );
    }

    const result = await sendEmailNotification(userId, title, message, link, recipientEmail);
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in send-email API route:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process email request" },
      { status: 500 }
    );
  }
}
