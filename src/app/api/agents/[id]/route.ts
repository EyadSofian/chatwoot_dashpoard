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
  if (!Number.isFinite(agentId)) return badRequest("معرّف الموظف غير صحيح");
  const filters = parseFilters(new URL(request.url).searchParams);
  const data = await getAgentDetail(agentId, filters);
  return NextResponse.json(data);
}
