import { NextResponse } from "next/server";
import { requireSession } from "@/lib/http";
import { parseFilters } from "@/lib/reporting/filters";
import { getConversationsPage } from "@/lib/reporting/conversations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const params = new URL(request.url).searchParams;
  const filters = parseFilters(params);
  const data = await getConversationsPage(filters, {
    page: Number(params.get("page")) || 1,
    pageSize: Number(params.get("pageSize")) || 50,
    sortBy: params.get("sortBy") || undefined,
    sortDir: (params.get("sortDir") as "asc" | "desc") || undefined,
  });
  return NextResponse.json(data);
}
