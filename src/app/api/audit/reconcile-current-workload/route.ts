import { NextResponse } from "next/server";
import { requireSessionOrCron, serverError, badRequest } from "@/lib/http";
import { assertChatwootEnv, assertDatabaseEnv } from "@/env";
import { reconcileCurrentWorkload } from "@/lib/audit/workload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Repair the mismatches: re-ingest, from Chatwoot, every conversation the two
 * sides disagree about. Writes only to the analytics database — never to
 * Chatwoot. Idempotent, because re-ingesting recomputes a conversation from
 * scratch rather than incrementing anything.
 */
export async function POST(request: Request) {
  const auth = await requireSessionOrCron(request);
  if (!auth.ok) return auth.response;

  try {
    assertChatwootEnv();
    assertDatabaseEnv();
  } catch (error) {
    return badRequest((error as Error).message);
  }

  let body: { maxPages?: number; maxFetch?: number } = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    /* defaults */
  }

  try {
    const stats = await reconcileCurrentWorkload(body);
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    return serverError("فشلت إعادة مطابقة الحمل الحالي", (error as Error).message);
  }
}
