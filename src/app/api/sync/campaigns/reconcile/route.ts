import { NextResponse } from "next/server";
import { requireSessionOrCron, serverError } from "@/lib/http";
import { reconcileCampaignReplies } from "@/lib/campaigns/reconcile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Re-derive campaign replies from already-imported sends, without re-importing.
 *
 * This is the historical repair after the migration: it walks every send, finds
 * the outbound template message in Chatwoot (pulling the conversation if we have
 * no messages for it locally), and measures the first customer reply after it.
 * Idempotent — reply rows are keyed by job+conversation, so re-running updates
 * instead of duplicating.
 *
 * Body: { historical?: true, days?: number }
 */
export async function POST(request: Request) {
  const auth = await requireSessionOrCron(request);
  if (!auth.ok) return auth.response;

  let body: { historical?: boolean; days?: number } = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    /* empty body → last 30 days */
  }

  const days = Math.max(1, Math.min(body.days ?? 30, 365));
  const since = body.historical ? undefined : new Date(Date.now() - days * 86400 * 1000);

  try {
    const stats = await reconcileCampaignReplies({
      since,
      maxJobs: body.historical ? 1000 : 200,
      maxConversationFetches: body.historical ? 2000 : 300,
    });
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    return serverError("Campaign reply recomputation failed", (error as Error).message);
  }
}
