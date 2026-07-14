import { NextResponse } from "next/server";
import { requireSessionOrCron, serverError } from "@/lib/http";
import { runCampaignSync } from "@/lib/ingest/campaignSync";
import { getCampaignSources } from "@/lib/campaigns/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireSessionOrCron(request);
  if (!auth.ok) return auth.response;

  if (!getCampaignSources().length) {
    return NextResponse.json(
      { ok: false, error: "لم يتم ضبط روابط تطبيقات الكامبين (CAMPAIGN_SALES_APP_URL / CAMPAIGN_OPERATIONS_APP_URL)" },
      { status: 400 },
    );
  }

  try {
    const stats = await runCampaignSync({});
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    return serverError("فشل استيراد الكامبينات", (error as Error).message);
  }
}
