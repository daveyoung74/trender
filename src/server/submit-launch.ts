import { NextResponse } from "next/server";
import {
  createLaunchRow,
  getLaunch,
  launchByIdempotency,
  publicLaunchView,
  runLaunch,
  type LaunchSeed,
} from "@/server/launch";
import { enqueueLaunch, launchWorkersOnline, waitForLaunchJob } from "@/server/queue";

const IN_FLIGHT = new Set(["queued", "inventing", "publishing", "sending"]);

async function runNow(id: string) {
  try {
    return await runLaunch(id);
  } catch {
    return getLaunch(id);
  }
}

export async function submitLaunchJob(input: LaunchSeed, idempotencyKey: string | null) {
  let replay = false;
  let row = idempotencyKey ? await launchByIdempotency(idempotencyKey) : null;
  if (row) {
    replay = true;
  } else {
    row = await createLaunchRow(input, idempotencyKey);
    const queued = await enqueueLaunch(row.id);
    const workers = await launchWorkersOnline();
    if (!queued || !workers) {
      row = await runNow(row.id);
    }
  }

  const wait = input.wait !== false;
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
  return NextResponse.json(view, { status });
}
