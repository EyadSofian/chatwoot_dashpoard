import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionOrCron, badRequest, serverError } from "@/lib/http";
import { assertChatwootEnv, assertDatabaseEnv } from "@/env";
import { runBackfill } from "@/lib/ingest/backfill";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  days: z.number().int().min(1).max(365).default(30),
  maxPages: z.number().int().min(1).max(200).optional(),
  maxConversations: z.number().int().min(1).max(20000).optional(),
});

export async function POST(request: Request) {
  const auth = await requireSessionOrCron(request);
  if (!auth.ok) return auth.response;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* empty body → defaults */
  }
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return badRequest("مدخلات غير صحيحة", parsed.error.flatten());

  try {
    assertChatwootEnv();
    assertDatabaseEnv();
  } catch (error) {
    return badRequest((error as Error).message);
  }

  try {
    const stats = await runBackfill(parsed.data);
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    return serverError("فشل الـ backfill", (error as Error).message);
  }
}
