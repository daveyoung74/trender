import { NextResponse } from "next/server";
import { requireSiteSession } from "@/server/auth";
import { jsonError } from "@/server/errors";
import { launchSeedSchema } from "@/server/launch";
import { submitLaunchJob } from "@/server/submit-launch";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireSiteSession(req);
    const body = await req.json().catch(() => ({}));
    const parsed = launchSeedSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid launch";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (!parsed.data.name?.trim() || !parsed.data.ticker?.trim() || !parsed.data.description?.trim()) {
      return NextResponse.json({ error: "Name, ticker, and description are required" }, { status: 400 });
    }
    if (!parsed.data.image_url?.trim() && !parsed.data.image_key?.trim() && !parsed.data.image_prompt?.trim()) {
      return NextResponse.json({ error: "Upload or generate an image first" }, { status: 400 });
    }
    return await submitLaunchJob({ ...parsed.data, wait: true }, parsed.data.idempotency_key?.trim() || null);
  } catch (err) {
    const { status, body } = jsonError(err);
    return NextResponse.json(body, { status });
  }
}
