import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { statusError } from "@/server/errors";
import { GATE_COOKIE, readCookie, verifyGateToken } from "@/server/site-gate";

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

export function sitePasswordMatches(provided: string, expected: string) {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function requireSiteSession(req: Request) {
  if (!env.sitePassword) {
    throw statusError(503, "SITE_PASSWORD is not set");
  }
  const token = readCookie(req.headers.get("cookie"), GATE_COOKIE);
  if (!token || !(await verifyGateToken(env.sessionSecret, token))) {
    throw statusError(401, "Sign in required");
  }
}
