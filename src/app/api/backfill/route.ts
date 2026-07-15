import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionOrCron, badRequest, serverError } from "@/lib/http";
import { assertChatwootEnv, assertDatabaseEnv } from "@/env";
import { runBackfill } from "@/lib/ingest/backfill";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  days: z.number().int().min(1).max(3650).default(30),
  scope: z.enum(["recent", "all"]).default("recent"),
  startPage: z.number().int().min(1).max(1_000_000).optional(),
  maxPages: z.number().int().min(1).max(5_000).optional(),
  // Keep one HTTP job bounded. Any data volume is handled through the returned
  // continuation cursor instead of gambling on an unbounded Railway request.
  maxConversations: z.number().int().min(1).max(10_000).default(250),
  concurrency: z.number().int().min(1).max(12).default(6),
});

export async function GET(request: Request) {
  const auth = await requireSessionOrCron(request);
  if (!auth.ok) return auth.response;

  const latest = await prisma.syncRun.findFirst({
    where: { type: "backfill" },
    orderBy: { startedAt: "desc" },
    select: { id: true, status: true, params: true, stats: true, startedAt: true, finishedAt: true, error: true },
  });
  return NextResponse.json({
    latest: latest ? { ...latest, id: String(latest.id) } : null,
  });
}

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
  if (!parsed.success) return badRequest("Invalid input", parsed.error.flatten());

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
    return serverError("Backfill failed", (error as Error).message);
  }
}
