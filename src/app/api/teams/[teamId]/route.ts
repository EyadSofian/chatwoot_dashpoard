import { NextResponse } from "next/server";
import { requireSession, badRequest } from "@/lib/http";
import { parseFilters } from "@/lib/reporting/filters";
import { getTeamDetail } from "@/lib/reporting/teams";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** One team: its KPI row plus every member, active or not. */
export async function GET(request: Request, ctx: { params: Promise<{ teamId: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const { teamId } = await ctx.params;
  const id = Number(teamId);
  if (!Number.isFinite(id)) return badRequest("Invalid team id");

  const filters = parseFilters(new URL(request.url).searchParams);
  const detail = await getTeamDetail(id, filters);
  return NextResponse.json(detail);
}
