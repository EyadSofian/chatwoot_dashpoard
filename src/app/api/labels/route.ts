import { NextResponse } from "next/server";
import { requireSession } from "@/lib/http";
import { parseFilters } from "@/lib/reporting/filters";
import { getLabels } from "@/lib/reporting/labels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Every Chatwoot label, with the selected period's metrics merged on. */
export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const filters = parseFilters(new URL(request.url).searchParams);
  const result = await getLabels(filters);
  return NextResponse.json(result);
}
