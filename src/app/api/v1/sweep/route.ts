import { NextResponse } from "next/server";
import { requireApiKey } from "@/server/auth";
import { jsonError } from "@/server/errors";
import { runSweep } from "@/server/sweep";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    requireApiKey(req);
    const run = await runSweep("manual");
    return NextResponse.json({
      id: run.id,
      status: run.status,
      trigger: run.trigger,
      vault_millisol: run.vaultMillisol,
      tx: run.tx,
      note: run.note,
    });
  } catch (err) {
    const { status, body } = jsonError(err);
    return NextResponse.json(body, { status });
  }
}
