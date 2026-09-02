import { NextResponse } from "next/server";
import { jsonError } from "@/server/errors";
import { getLaunch, publicLaunchView } from "@/server/launch";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = await getLaunch(id);
    return NextResponse.json(publicLaunchView(row));
  } catch (err) {
    const { status, body } = jsonError(err);
    return NextResponse.json(body, { status });
  }
}
