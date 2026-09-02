import { NextResponse } from "next/server";
import { getLaunchRateLimit } from "@/server/env";
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
import { enqueueLaunch, waitForLaunchJob } from "@/server/queue";
import { hitRateLimit } from "@/server/rate-limit";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const IN_FLIGHT = new Set(["queued", "inventing", "publishing", "sending"]);

export async function POST(req: Request) {
  try {
    requireApiKey(req);
    const parsed = launchSeedSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid launch";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const headerKey = req.headers.get("idempotency-key")?.trim() || null;
    const key = parsed.data.idempotency_key?.trim() || headerKey;
    let replay = false;
    let row = key ? await launchByIdempotency(key) : null;
    if (row) {
      replay = true;
    } else {
      const limited = await hitRateLimit("launch:global", getLaunchRateLimit());
      if (!limited.ok) {
        return NextResponse.json(
          { error: `Too many launches this hour (${getLaunchRateLimit()} cap)` },
          { status: 429 },
        );
      }
      row = await createLaunchRow(parsed.data, key);
      const queued = await enqueueLaunch(row.id);
      if (!queued) {
        try {
          row = await runLaunch(row.id);
        } catch {
          row = await getLaunch(row.id);
        }
      }
    }

    const wait = parsed.data.wait !== false;
    if (wait && IN_FLIGHT.has(row.status)) {
      await waitForLaunchJob(row.id);
      row = await getLaunch(row.id);
      if (row.status === "queued") {
        try {
          row = await runLaunch(row.id);
        } catch {
          row = await getLaunch(row.id);
        }
      }
    }

    const view = publicLaunchView(row);
    const terminal = row.status === "live" || row.status === "ready" || row.status === "failed";
    const status = wait && terminal ? 200 : replay && terminal ? 200 : terminal ? 200 : 202;
    return NextResponse.json(view, { status });
  } catch (err) {
    const { status, body } = jsonError(err);
    return NextResponse.json(body, { status });
  }
}
