import { Queue, Worker } from "bullmq";
import { env } from "@/server/env";
import { listInFlightLaunchIds, runLaunch } from "@/server/launch";
import { enqueueLaunch, QUEUE_NAME } from "@/server/queue";
import { bullmqPrefix, createRedisConnection } from "@/server/redis";
import { runSweep } from "@/server/sweep";

type GlobalWorker = typeof globalThis & { __trenderWorkerStarted?: boolean };

async function recoverInFlightLaunches() {
  const ids = await listInFlightLaunchIds();
  let recovered = 0;
  for (const id of ids) {
    if (await enqueueLaunch(id, true)) recovered += 1;
  }
  return recovered;
}

export async function startTrenderWorker() {
  const g = globalThis as GlobalWorker;
  if (g.__trenderWorkerStarted) return;
  if (!env.redisUrl) {
    console.log("[worker] REDIS_URL missing — launches run inline.");
    return;
  }
  g.__trenderWorkerStarted = true;

  const prefix = bullmqPrefix();
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "launch") {
        const launchId = (job.data as { launchId?: string }).launchId;
        if (!launchId) throw new Error("launch job missing launchId");
        console.info("[worker] launch started", { launchId, jobId: job.id });
        const row = await runLaunch(launchId);
        console.info("[worker] launch completed", {
          launchId,
          jobId: job.id,
          status: row.status,
          ticker: row.ticker,
        });
        return row;
      }
      if (job.name === "fees.sweep") {
        return runSweep("schedule");
      }
      console.log("[worker] job", job.name, job.id);
    },
    {
      connection: createRedisConnection(),
      prefix,
      concurrency: 1,
    },
  );
  worker.on("failed", (job, err) => {
    console.error("[worker] failed", job?.id, err);
  });

  const queue = new Queue(QUEUE_NAME, {
    connection: createRedisConnection(),
    prefix,
  });
  await queue.waitUntilReady();
  const repeats = await queue.getRepeatableJobs();
  if (!repeats.some((job) => job.name === "fees.sweep")) {
    await queue.add("fees.sweep", {}, { repeat: { every: 60 * 60 * 1000 } });
  }
  const recovered = await recoverInFlightLaunches();
  console.log("[worker] ready", { prefix, recovered });
}
