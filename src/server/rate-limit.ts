import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { rateBuckets } from "@/db/schema";
import { env } from "@/server/env";
import { getAppRedis, redisKey } from "@/server/redis";

export async function hitRateLimit(key: string, limit: number, windowMs = 60 * 60 * 1000) {
  if (env.redisUrl) {
    try {
      const redis = getAppRedis();
      const redisKeyName = redisKey("rl", key);
      const count = await redis.incr(redisKeyName);
      if (count === 1) await redis.pexpire(redisKeyName, windowMs);
      if (count > limit) return { ok: false, remaining: 0 };
      return { ok: true, remaining: Math.max(0, limit - count) };
    } catch (err) {
      console.error("[rate-limit] Redis failed; falling back to MySQL");
      void err;
    }
  }
  return hitRateLimitSql(key, limit, windowMs);
}

async function hitRateLimitSql(key: string, limit: number, windowMs: number) {
  const db = getDb();
  const now = Date.now();
  const row = (await db.select().from(rateBuckets).where(eq(rateBuckets.key, key)).limit(1))[0];
  if (!row) {
    await db.insert(rateBuckets).values({
      key,
      windowStart: new Date(now),
      count: 1,
    });
    return { ok: true, remaining: limit - 1 };
  }
  const start = row.windowStart instanceof Date ? row.windowStart.getTime() : Number(row.windowStart);
  if (now - start > windowMs) {
    await db
      .update(rateBuckets)
      .set({ windowStart: new Date(now), count: 1 })
      .where(eq(rateBuckets.key, key));
    return { ok: true, remaining: limit - 1 };
  }
  const count = row.count + 1;
  if (count > limit) {
    return { ok: false, remaining: 0 };
  }
  await db.update(rateBuckets).set({ count }).where(eq(rateBuckets.key, key));
  return { ok: true, remaining: limit - count };
}
