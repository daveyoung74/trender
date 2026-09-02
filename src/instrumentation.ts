export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startTrenderWorker } = await import("./server/worker");
  startTrenderWorker().catch((err) => {
    console.error("[worker] boot failed", err);
  });
}
