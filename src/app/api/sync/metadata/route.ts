import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionOrCron, badRequest, serverError } from "@/lib/http";
import { assertChatwootEnv, assertDatabaseEnv } from "@/env";
import { ChatwootClient } from "@/lib/chatwoot/client";
import { syncEntities, getMetadataSyncState } from "@/lib/ingest/entities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  agents: z.boolean().optional(),
  teams: z.boolean().optional(),
  inboxes: z.boolean().optional(),
  labels: z.boolean().optional(),
});

/** Current sync state — drives the "sync first" warning and the Settings screen. */
export async function GET() {
  const auth = await requireSessionOrCron(new Request("http://local/"));
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getMetadataSyncState());
}

/**
 * POST {} → sync everything.
 * POST { teams: true } → just teams (and their members).
 */
export async function POST(request: Request) {
  const auth = await requireSessionOrCron(request);
  if (!auth.ok) return auth.response;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* empty body → sync all */
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
    const state = await syncEntities(new ChatwootClient(), parsed.data);
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return serverError("فشلت مزامنة بيانات Chatwoot", (error as Error).message);
  }
}
