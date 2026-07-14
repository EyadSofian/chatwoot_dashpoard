import { NextResponse } from "next/server";
import { requireSessionOrCron, serverError } from "@/lib/http";
import { runCampaignSync } from "@/lib/ingest/campaignSync";
import { reconcileCampaignReplies } from "@/lib/campaigns/reconcile";
import { getCampaignSources } from "@/lib/campaigns/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Import the campaign jobs, then tie every send to the reply it produced.
 *
 * Both halves are idempotent, so this is safe on a 10–15 minute cron: the import
 * upserts by (sourceKey, jobId), and reconciliation upserts reply rows by
 * `job:<jobId>:conv:<id>`. Running it twice cannot double-count a reply.
 *
 * Body:
 *   { reconcile?: false }        skip correlation (import only)
 *   { historical?: true }        reconcile ALL jobs, not just recent ones —
 *                                the one-shot repair after the migration
 */
export async function POST(request: Request) {
  const auth = await requireSessionOrCron(request);
  if (!auth.ok) return auth.response;

  if (!getCampaignSources().length) {
    return NextResponse.json(
      { ok: false, error: "لم يتم ضبط روابط تطبيقات الكامبين (CAMPAIGN_SALES_APP_URL / CAMPAIGN_OPERATIONS_APP_URL)" },
      { status: 400 },
    );
  }

  let body: { reconcile?: boolean; historical?: boolean } = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    /* empty body → import + reconcile recent */
  }

  try {
    const importStats = await runCampaignSync({});

    if (body.reconcile === false) {
      return NextResponse.json({ ok: true, stats: importStats, reconciliation: null });
    }

    // Recent by default so a cron tick stays bounded; historical when repairing.
    const since = body.historical ? undefined : new Date(Date.now() - 30 * 86400 * 1000);
    const reconciliation = await reconcileCampaignReplies({
      since,
      maxJobs: body.historical ? 1000 : 200,
      maxConversationFetches: body.historical ? 2000 : 150,
    });

    return NextResponse.json({ ok: true, stats: importStats, reconciliation });
  } catch (error) {
    return serverError("فشل استيراد الكامبينات", (error as Error).message);
  }
}
