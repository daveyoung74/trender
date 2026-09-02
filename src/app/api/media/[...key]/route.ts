import { readFile, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const relative = key.join("/");
  if (relative.includes("..") || path.isAbsolute(relative)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const uploadsRoot = path.resolve(process.cwd(), "data", "uploads");
  const filePath = path.resolve(uploadsRoot, relative);
  if (!filePath.startsWith(uploadsRoot + path.sep) && filePath !== uploadsRoot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await stat(filePath);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ext = path.extname(filePath).toLowerCase();
  const type =
    ext === ".svg"
      ? "image/svg+xml"
      : ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";
  const buf = await readFile(filePath);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=60",
    },
  });
}
