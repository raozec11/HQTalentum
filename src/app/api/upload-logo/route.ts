import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const slug = formData.get("slug") as string;

    if (!file || !slug) {
      return NextResponse.json({ error: "Missing file or slug" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const dir = path.join(process.cwd(), "public", "assets", "logos");
    await mkdir(dir, { recursive: true });

    // Always use companyslug_logo.{ext}
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const filename = `${slug}_logo.${ext}`;
    const filepath = path.join(dir, filename);

    await writeFile(filepath, buffer);

    return NextResponse.json({ url: `/api/files/assets/logos/${filename}`, filename });
  } catch (error: any) {
    console.error("Logo upload error:", error);
    return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
  }
}
