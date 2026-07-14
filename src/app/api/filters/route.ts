import { NextResponse } from "next/server";
import { requireSession } from "@/lib/http";
import { getFilterOptions } from "@/lib/reporting/filterOptions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const data = await getFilterOptions();
  return NextResponse.json(data);
}
