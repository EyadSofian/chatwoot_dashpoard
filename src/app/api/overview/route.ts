import { NextResponse } from "next/server";
import { env } from "@/env";
import { requireSession } from "@/lib/http";
import { parseFilters } from "@/lib/reporting/filters";
import { getOverview } from "@/lib/reporting/overview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const filters = parseFilters(new URL(request.url).searchParams);
  const data = await getOverview(filters, env.timezone());
  return NextResponse.json(data);
}
