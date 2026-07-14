import { NextResponse } from "next/server";
import { requireSession } from "@/lib/http";
import { ChatwootClient } from "@/lib/chatwoot/client";
import { connectionFromEnv } from "@/lib/chatwoot/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let overrides: Partial<{ baseUrl: string; accountId: string; apiToken: string }> = {};
  try {
    overrides = (await request.json()) ?? {};
  } catch {
    /* use env */
  }

  try {
    const conn = { ...connectionFromEnv(), ...overrides };
    const client = new ChatwootClient(conn);
    const probe = await client.probe();
    return NextResponse.json({ baseUrl: conn.baseUrl, accountId: conn.accountId, ...probe });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 200 });
  }
}
