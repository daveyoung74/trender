/**
 * Optional standalone worker. The Next.js web process already runs the same
 * consumer via instrumentation.ts — DigitalOcean does not need a second component.
 */
import { startTrenderWorker } from "@/server/worker";

startTrenderWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
