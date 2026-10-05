import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const slug = formData.get("slug") as string;
    const type = formData.get("type") as string; // 'cashapp' or 'venmo'

    if (!file || !slug || !type) {
      return NextResponse.json({ error: "Missing file, slug, or type" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const dir = path.join(process.cwd(), "public", "assets", "qrs");
    await mkdir(dir, { recursive: true });

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const filename = `${slug}_${type}_qr_${Date.now()}.${ext}`;
    const filepath = path.join(dir, filename);

    await writeFile(filepath, buffer);

    return NextResponse.json({ url: `/api/files/assets/qrs/${filename}`, filename });
  } catch (error: any) {
    console.error("QR upload error:", error);
    return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
  }
}
