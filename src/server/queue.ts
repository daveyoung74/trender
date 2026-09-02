import { Queue, QueueEvents } from "bullmq";
import { env } from "@/server/env";
import { bullmqPrefix, createRedisConnection } from "@/server/redis";

export const QUEUE_NAME = "trender";
export const WAIT_MS = 90_000;

let queue: Queue | null = null;

export function getQueue() {
  if (!env.redisUrl) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: createRedisConnection(),
      prefix: bullmqPrefix(),
    });
  }
  return queue;
}

export async function launchWorkersOnline() {
  const q = getQueue();
  if (!q) return false;
  try {
    const workers = await q.getWorkers();
    return workers.length > 0;
  } catch {
    return false;
  }
}

export async function enqueueLaunch(launchId: string, retry = false) {
  const q = getQueue();
  if (!q) return false;
  const existing = await q.getJob(launchId);
  if (existing) {
    const state = await existing.getState();
    if (state === "active" || state === "waiting" || state === "delayed" || state === "paused") {
      return true;
    }
    if (!retry) return true;
    await existing.remove().catch(() => undefined);
  }
  await q.add(
    "launch",
    { launchId },
    {
      jobId: launchId,
      attempts: 1,
      removeOnComplete: 200,
      removeOnFail: 200,
    },
  );
  return true;
}

export async function waitForLaunchJob(launchId: string, ms = WAIT_MS) {
  const q = getQueue();
  if (!q) return;
  const job = await q.getJob(launchId);
  if (!job) return;
  const events = new QueueEvents(QUEUE_NAME, {
    connection: createRedisConnection(),
    prefix: bullmqPrefix(),
  });
  await events.waitUntilReady();
  try {
    await job.waitUntilFinished(events, ms);
  } catch {
    /* timeout or failed — caller reloads the row */
  } finally {
    await events.close();
  }
}
