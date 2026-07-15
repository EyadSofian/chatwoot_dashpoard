import { NextResponse } from "next/server";
import { requireSession } from "@/lib/http";
import { getCampaignDetail } from "@/lib/reporting/campaigns";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, ctx: { params: Promise<{ source: string; jobId: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { source, jobId } = await ctx.params;
  const params = new URL(request.url).searchParams;
  const recipientPage = Number(params.get("recipientPage") ?? 1) || 1;
  const replyPage = Number(params.get("replyPage") ?? 1) || 1;
  const data = await getCampaignDetail(source, jobId, recipientPage, replyPage, 100);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
