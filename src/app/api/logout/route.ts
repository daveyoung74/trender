import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { serializeGateCookie } from "@/server/site-gate";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", serializeGateCookie("", 0, env.isProd));
  return res;
}
