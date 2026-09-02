import { NextResponse } from "next/server";
import { sitePasswordMatches } from "@/server/auth";
import { env } from "@/server/env";
import { jsonError } from "@/server/errors";
import {
  GATE_TTL_SEC,
  safeNextPath,
  serializeGateCookie,
  signGateToken,
} from "@/server/site-gate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!env.sitePassword) {
      return NextResponse.json({ error: "SITE_PASSWORD is not set" }, { status: 503 });
    }
    const body = (await req.json().catch(() => ({}))) as { password?: unknown; next?: unknown };
    const password = typeof body.password === "string" ? body.password : "";
    if (!password || !sitePasswordMatches(password, env.sitePassword)) {
      return NextResponse.json({ error: "Wrong password" }, { status: 401 });
    }
    const token = await signGateToken(env.sessionSecret);
    const res = NextResponse.json({ ok: true, next: safeNextPath(typeof body.next === "string" ? body.next : null) });
    res.headers.set("Set-Cookie", serializeGateCookie(token, GATE_TTL_SEC, env.isProd));
    return res;
  } catch (err) {
    const { status, body } = jsonError(err);
    return NextResponse.json(body, { status });
  }
}
