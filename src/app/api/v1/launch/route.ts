import { NextResponse } from "next/server";
import { requireApiKey } from "@/server/auth";
import { jsonError } from "@/server/errors";
import {
  createLaunchRow,
  getLaunch,
  launchByIdempotency,
  launchSeedSchema,
  publicLaunchView,
  runLaunch,
} from "@/server/launch";
import { enqueueLaunch, launchWorkersOnline, waitForLaunchJob } from "@/server/queue";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const IN_FLIGHT = new Set(["queued", "inventing", "publishing", "sending"]);

async function runNow(id: string) {
  try {
    return await runLaunch(id);
  } catch {
    return getLaunch(id);
  }
}

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
    let replay = false;
    let row = key ? await launchByIdempotency(key) : null;
    if (row) {
      replay = true;
    } else {
      row = await createLaunchRow(parsed.data, key);
      const queued = await enqueueLaunch(row.id);
      const workers = await launchWorkersOnline();
      if (!queued || !workers) {
        row = await runNow(row.id);
      }
    }

    const wait = parsed.data.wait !== false;
    if (wait && IN_FLIGHT.has(row.status)) {
      await waitForLaunchJob(row.id);
      row = await getLaunch(row.id);
      if (IN_FLIGHT.has(row.status)) {
        row = await runNow(row.id);
      }
    }

    const view = publicLaunchView(row);
    const terminal = row.status === "live" || row.status === "ready" || row.status === "failed";
    const status = wait && terminal ? 200 : replay && terminal ? 200 : terminal ? 200 : 202;
    console.info("[launch-api] response", {
      requestId,
      launchId: row.id,
      status: row.status,
      httpStatus: status,
      replay,
    });
    return NextResponse.json(view, { status });
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
