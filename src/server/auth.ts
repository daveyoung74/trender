import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { statusError } from "@/server/errors";

export function requireApiKey(req: Request) {
  if (!env.trenderApiKey) {
    throw statusError(503, "TRENDER_API_KEY is not set");
  }
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/.exec(header.trim());
  if (!m) throw statusError(401, "API key required");
  const a = Buffer.from(m[1]);
  const b = Buffer.from(env.trenderApiKey);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw statusError(401, "API key required");
  }
}
