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
  // Default: scan completely (fetchLiveWorkload pages until Chatwoot's own total
  // is reached). Only pass a bound if one is explicitly given — as a safety
  // override, not a truncation.
  const raw = url.searchParams.get("maxPages");
  const maxPages = raw ? Number(raw) || undefined : undefined;

  try {
    return NextResponse.json(await auditAgents(filters, { maxPages }));
  } catch (error) {
    return serverError("Audit failed", (error as Error).message);
  }
}
