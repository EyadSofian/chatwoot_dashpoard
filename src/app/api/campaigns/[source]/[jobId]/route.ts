import { NextResponse } from "next/server";
import { requireSession } from "@/lib/http";
import { getCampaignDetail } from "@/lib/reporting/campaigns";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, ctx: { params: Promise<{ source: string; jobId: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { source, jobId } = await ctx.params;
  const data = await getCampaignDetail(source, jobId);
  if (!data) return NextResponse.json({ error: "غير موجودة" }, { status: 404 });
  return NextResponse.json(data);
}
