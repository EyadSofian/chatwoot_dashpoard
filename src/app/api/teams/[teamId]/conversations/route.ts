import { NextResponse } from "next/server";
import { requireSession, badRequest } from "@/lib/http";
import { parseFilters } from "@/lib/reporting/filters";
import { getTeamConversations } from "@/lib/reporting/teams";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Paginated — a busy team's conversation list is the one unbounded thing here. */
export async function GET(request: Request, ctx: { params: Promise<{ teamId: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const { teamId } = await ctx.params;
  const id = Number(teamId);
  if (!Number.isFinite(id)) return badRequest("رقم تيم غير صحيح");

  const url = new URL(request.url);
  const filters = parseFilters(url.searchParams);
  const page = Number(url.searchParams.get("page") ?? 1) || 1;
  const pageSize = Number(url.searchParams.get("pageSize") ?? 50) || 50;

  const result = await getTeamConversations(id, filters, page, pageSize);
  return NextResponse.json(result);
}
