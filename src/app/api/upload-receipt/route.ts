import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const bookingId = formData.get("bookingId") as string;

    if (!file || !bookingId) {
      return NextResponse.json({ error: "Missing file or booking ID" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const dir = path.join(process.cwd(), "public", "assets", "receipts");
    await mkdir(dir, { recursive: true });

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const filename = `receipt_${bookingId}_${Date.now()}.${ext}`;
    const filepath = path.join(dir, filename);

    await writeFile(filepath, buffer);

    return NextResponse.json({ url: `/api/files/assets/receipts/${filename}`, filename });
  } catch (error: any) {
    console.error("Receipt upload error:", error);
    return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
  }
}
