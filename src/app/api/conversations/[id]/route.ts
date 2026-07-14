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
  if (!Number.isFinite(chatwootId)) return badRequest("معرّف المحادثة غير صحيح");
  const data = await getConversationDetail(chatwootId);
  if (!data) return NextResponse.json({ error: "غير موجودة" }, { status: 404 });
  return NextResponse.json(data);
}
