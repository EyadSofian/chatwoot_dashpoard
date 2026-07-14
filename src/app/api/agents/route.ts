import { NextResponse } from "next/server";
import { requireSession } from "@/lib/http";
import { parseFilters } from "@/lib/reporting/filters";
import { getAgentLeaderboard } from "@/lib/reporting/agents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Every agent on the roster, with the selected period's metrics merged on. */
export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const filters = parseFilters(new URL(request.url).searchParams);
  const { rows, summary } = await getAgentLeaderboard(filters);
  return NextResponse.json({ rows, summary });
}
