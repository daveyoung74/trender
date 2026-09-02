import { NextResponse } from "next/server";
import { listBoardLaunches, publicLaunchView } from "@/server/launch";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await listBoardLaunches();
    return NextResponse.json({ launches: rows.map(publicLaunchView) });
  } catch {
    return NextResponse.json({ launches: [] });
  }
}
