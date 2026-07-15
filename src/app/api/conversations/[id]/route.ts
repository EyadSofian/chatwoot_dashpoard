import { NextResponse } from "next/server";
import { requireSession, badRequest } from "@/lib/http";
import { getConversationDetail } from "@/lib/reporting/conversations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const chatwootId = Number(id);
  if (!Number.isFinite(chatwootId)) return badRequest("Invalid conversation id");
  const data = await getConversationDetail(chatwootId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
