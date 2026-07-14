import { NextResponse } from "next/server";
import { requireSession, serverError, badRequest } from "@/lib/http";
import { assertChatwootEnv } from "@/env";
import { parseFilters } from "@/lib/reporting/filters";
import { auditAgentDetail } from "@/lib/audit/workload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Every conversation id for one agent, with the exact reason it counts or not. */
export async function GET(request: Request, ctx: { params: Promise<{ agentId: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const { agentId } = await ctx.params;
  const id = Number(agentId);
  if (!Number.isFinite(id)) return badRequest("رقم موظف غير صحيح");

  try {
    assertChatwootEnv();
  } catch (error) {
    return badRequest((error as Error).message);
  }

  const url = new URL(request.url);
  const filters = parseFilters(url.searchParams);
  const maxPages = Number(url.searchParams.get("maxPages") ?? 40) || 40;

  try {
    return NextResponse.json(await auditAgentDetail(id, filters, { maxPages }));
  } catch (error) {
    return serverError("فشل تدقيق بيانات الموظف", (error as Error).message);
  }
}
