/**
 * Trender worker: launch jobs (concurrency 1) and hourly creator-fee sweep.
 */
import { Queue, Worker } from "bullmq";
import { env } from "@/server/env";
import { runLaunch } from "@/server/launch";
import { QUEUE_NAME } from "@/server/queue";
import { bullmqPrefix, createRedisConnection } from "@/server/redis";
import { runSweep } from "@/server/sweep";

async function main() {
  if (!env.redisUrl) {
    console.log("[worker] REDIS_URL missing — idle.");
    return;
  }

  const connection = createRedisConnection();
  const prefix = bullmqPrefix();
  const queueOpts = { connection, prefix, concurrency: 1 as const };

  const queue = new Queue(QUEUE_NAME, { connection, prefix });

  new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "launch") {
        const launchId = (job.data as { launchId?: string }).launchId;
        if (!launchId) throw new Error("launch job missing launchId");
        return runLaunch(launchId);
      }
      if (job.name === "fees.sweep") {
        return runSweep("schedule");
      }
      console.log("[worker] job", job.name, job.id);
    },
    queueOpts,
  );

  await queue.waitUntilReady();
  const repeats = await queue.getRepeatableJobs();
  if (!repeats.some((j) => j.name === "fees.sweep")) {
    await queue.add("fees.sweep", {}, { repeat: { every: 60 * 60 * 1000 } });
  }
  console.log("[worker] ready", { prefix });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
