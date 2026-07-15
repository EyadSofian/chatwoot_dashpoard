import { NextResponse } from "next/server";
import { requireSession, badRequest } from "@/lib/http";
import { parseFilters } from "@/lib/reporting/filters";
import { getAgentDetail } from "@/lib/reporting/agents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const agentId = Number(id);
  if (!Number.isFinite(agentId)) return badRequest("Invalid agent id");
  const url = new URL(request.url);
  const filters = parseFilters(url.searchParams);
  const page = Number(url.searchParams.get("page") ?? 1) || 1;
  const pageSize = Number(url.searchParams.get("pageSize") ?? 50) || 50;
  const data = await getAgentDetail(agentId, filters, page, pageSize);
  return NextResponse.json(data);
}
