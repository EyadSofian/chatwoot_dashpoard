import { NextResponse } from "next/server";
import { requireSession, serverError, badRequest } from "@/lib/http";
import { assertChatwootEnv } from "@/env";
import { parseFilters } from "@/lib/reporting/filters";
import { auditAgents } from "@/lib/audit/workload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Live Chatwoot vs the analytics DB, per agent. Read-only against Chatwoot. */
export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    assertChatwootEnv();
  } catch (error) {
    return badRequest((error as Error).message);
  }

  const url = new URL(request.url);
  const filters = parseFilters(url.searchParams);
  const maxPages = Number(url.searchParams.get("maxPages") ?? 40) || 40;

  try {
    return NextResponse.json(await auditAgents(filters, { maxPages }));
  } catch (error) {
    return serverError("فشل تدقيق البيانات", (error as Error).message);
  }
}
