import { NextResponse } from "next/server";
import { requireApiKey } from "@/server/auth";
import { jsonError } from "@/server/errors";
import { listSweepRuns, sweepMeta } from "@/server/sweep";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    requireApiKey(req);
    const meta = await sweepMeta();
    const runs = await listSweepRuns();
    return NextResponse.json({
      ...meta,
      recent_sweeps: runs.map((row) => ({
        id: row.id,
        status: row.status,
        trigger: row.trigger,
        vault_millisol: row.vaultMillisol,
        tx: row.tx,
        note: row.note,
        created_at: row.createdAt,
      })),
    });
  } catch (err) {
    const { status, body } = jsonError(err);
    return NextResponse.json(body, { status });
  }
}
