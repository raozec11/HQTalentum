import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { to, type, message, subject } = data;

    // MVP Mock Implementation 
    // In production, integrate Resend/SendGrid and Twilio Node SDK here
    
    console.log("================ MOCK NOTIFICATION SYSTEM ================");
    if (type === "SMS") {
      console.log(`[Twilio Mock] Sending SMS to ${to}`);
      console.log(`[Twilio Mock] Message Payload: "${message}"`);
    } else if (type === "EMAIL") {
      console.log(`[Email Mock] Sending Email to ${to}`);
      console.log(`[Email Mock] Subject: ${subject}`);
      console.log(`[Email Mock] Body: \n${message}`);
    } else {
      console.log(`[Unknown Mock] Sending to ${to}`);
    }
    console.log("==========================================================");

    return NextResponse.json({ success: true, mockSent: true });
  } catch (error) {
    console.error("Notification API Error:", error);
    return NextResponse.json({ success: false, error: "Failed to send notification" }, { status: 500 });
  }
}
