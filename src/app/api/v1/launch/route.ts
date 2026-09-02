import { NextResponse } from "next/server";
import { requireApiKey } from "@/server/auth";
import { jsonError } from "@/server/errors";
import { launchSeedSchema } from "@/server/launch";
import { submitLaunchJob } from "@/server/submit-launch";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    requireApiKey(req);
    const body = await req.json().catch(() => ({}));
    const parsed = launchSeedSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid launch";
      console.warn("[launch-api] rejected", {
        requestId,
        message,
        fields: body && typeof body === "object" ? Object.keys(body) : [],
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const headerKey = req.headers.get("idempotency-key")?.trim() || null;
    const key = parsed.data.idempotency_key?.trim() || headerKey;
    console.info("[launch-api] received", {
      requestId,
      idempotent: Boolean(key),
      dryRun: parsed.data.dry_run,
      wait: parsed.data.wait,
      name: parsed.data.name ?? null,
      ticker: parsed.data.ticker ?? null,
      tweetUrl: parsed.data.tweet_url ?? null,
      authorHandle: parsed.data.author_handle ?? null,
      imageHint: parsed.data.image_hint ?? null,
      imagePromptLength: parsed.data.image_prompt?.length ?? 0,
      promptLength: parsed.data.prompt?.length ?? 0,
    });

    const res = await submitLaunchJob(parsed.data, key);
    console.info("[launch-api] response", {
      requestId,
      httpStatus: res.status,
    });
    return res;
  } catch (err) {
    const { status, body } = jsonError(err);
    console.error("[launch-api] failed", {
      requestId,
      status,
      error: body.error,
    });
    return NextResponse.json(body, { status });
  }
}
