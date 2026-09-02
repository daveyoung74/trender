import IORedis, { type Redis } from "ioredis";
import { env } from "@/server/env";

export function redisPrefix(): string {
  const raw = env.redisPrefix.replace(/:+$/g, "").trim();
  return raw || "trender";
}

export function redisKey(...parts: Array<string | number>): string {
  const segs = parts.map((p) => String(p).replace(/^:+|:+$/g, "")).filter(Boolean);
  return [redisPrefix(), ...segs].join(":");
}

export function bullmqPrefix(): string {
  return redisPrefix();
}

export function createRedisConnection(): Redis {
  if (!env.redisUrl) {
    throw new Error("REDIS_URL is not set");
  }
  return new IORedis(env.redisUrl, {
    maxRetriesPerRequest: null,
  });
}

let appRedis: Redis | null = null;

export function getAppRedis(): Redis {
  if (!appRedis) {
    if (!env.redisUrl) {
      throw new Error("REDIS_URL is not set");
    }
    appRedis = new IORedis(env.redisUrl, {
      maxRetriesPerRequest: 3,
    });
  }
  return appRedis;
}
