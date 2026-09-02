import { NextResponse } from "next/server";
import { requireSiteSession } from "@/server/auth";
import { jsonError } from "@/server/errors";
import { newId } from "@/server/ids";
import { requireSafeText } from "@/server/safety";
import { ingestImage } from "@/server/storage";
import { generateMemeImage, finalizeMemeImagePrompt } from "@/server/xai";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    await requireSiteSession(req);
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size < 1) {
        return NextResponse.json({ error: "Choose an image file" }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: "Image is too large (8 MB max)" }, { status: 400 });
      }
      if (file.type && !file.type.startsWith("image/")) {
        return NextResponse.json({ error: "File must be an image" }, { status: 400 });
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const stored = await ingestImage({ bytes, key: `studio/${newId()}/image.jpg` });
      return NextResponse.json({ url: stored.url, key: stored.key, kind: "post" });
    }

    const body = (await req.json().catch(() => ({}))) as {
      prompt?: unknown;
      name?: unknown;
      ticker?: unknown;
    };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json({ error: "Image description is required" }, { status: 400 });
    }
    requireSafeText([prompt]);
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Coin";
    const ticker = typeof body.ticker === "string" && body.ticker.trim() ? body.ticker.trim() : "COIN";
    const bytes = await generateMemeImage(finalizeMemeImagePrompt(prompt, name, ticker));
    const stored = await ingestImage({ bytes, key: `studio/${newId()}/image.jpg` });
    return NextResponse.json({ url: stored.url, key: stored.key, kind: "ai", prompt });
  } catch (err) {
    const { status, body } = jsonError(err);
    return NextResponse.json(body, { status });
  }
}
