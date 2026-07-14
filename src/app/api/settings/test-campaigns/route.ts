import { NextResponse } from "next/server";
import { requireSession } from "@/lib/http";
import { getCampaignSources, probeCampaignApp } from "@/lib/campaigns/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const sources = getCampaignSources();
  const results = await Promise.all(
    sources.map(async (s) => ({ key: s.key, name: s.name, baseUrl: s.baseUrl, ...(await probeCampaignApp(s.baseUrl)) })),
  );
  return NextResponse.json({ ok: true, sources: results });
}
