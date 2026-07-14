import { NextResponse } from "next/server";
import { env } from "@/env";
import { isWebhookAuthorized } from "@/lib/chatwoot/webhook";
import { processWebhook } from "@/lib/ingest/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/webhooks/chatwoot
 * Verifies WEBHOOK_SECRET (shared-secret or HMAC signature), stores the raw
 * event idempotently, and recomputes the affected conversation.
 */
export async function POST(request: Request) {
  const rawBody = Buffer.from(await request.arrayBuffer());
  const url = new URL(request.url);

  const auth = isWebhookAuthorized({
    secret: env.webhookSecret(),
    rawBody,
    headers: request.headers,
    searchParams: url.searchParams,
    maxAgeSeconds: env.webhookMaxAgeSeconds(),
  });
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await processWebhook(rawBody, body, auth.via === "hmac_signature");
    return NextResponse.json(result);
  } catch (error) {
    // Ack with 200 so Chatwoot does not enter a retry storm; the error is logged
    // and the raw event (if stored) can be reprocessed later.
    console.error("[webhook] processing error:", (error as Error).message);
    return NextResponse.json({ ok: false, error: "processing_error" });
  }
}

export function GET() {
  return NextResponse.json({ ok: true, endpoint: "chatwoot-webhook" });
}
