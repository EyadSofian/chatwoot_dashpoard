import { NextResponse } from "next/server";
import { requireSession } from "@/lib/http";
import { parseFilters } from "@/lib/reporting/filters";
import { getTeams } from "@/lib/reporting/teams";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Every Chatwoot team, with the selected period's metrics merged on. */
export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const filters = parseFilters(new URL(request.url).searchParams);
  const report = await getTeams(filters);
  return NextResponse.json(report);
}
