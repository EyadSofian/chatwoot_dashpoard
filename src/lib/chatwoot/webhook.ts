import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Chatwoot webhook authentication — mirrors Chatwoot-Actions/webhookSecurity.js.
 *
 * Two accepted schemes (either passes):
 *  1. Shared secret in `?token=` / `?secret=` query or `x-webhook-secret` header.
 *  2. HMAC signature: sha256( `${timestamp}.` + rawBody ) compared against
 *     `x-chatwoot-signature` (bare hex or `sha256=<hex>`), with `x-chatwoot-timestamp`.
 *
 * When no WEBHOOK_SECRET is configured, webhooks are accepted (dev/opt-in).
 */
export function verifyHmacSignature(params: {
  secret: string;
  signature?: string | null;
  timestamp?: string | null;
  rawBody: Buffer | string;
  maxAgeSeconds?: number;
  nowMs?: number;
}): boolean {
  const { secret, signature, timestamp, rawBody, maxAgeSeconds = 0, nowMs = Date.now() } = params;
  if (!secret || !signature || !timestamp || rawBody === undefined || rawBody === null) return false;

  const timestampNumber = Number(timestamp);
  if (maxAgeSeconds > 0) {
    if (!Number.isFinite(timestampNumber)) return false;
    const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - timestampNumber);
    if (ageSeconds > maxAgeSeconds) return false;
  }

  const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8");
  const digest = createHmac("sha256", String(secret))
    .update(`${timestamp}.`)
    .update(bodyBuffer)
    .digest("hex");

  return (
    timingSafeStringEqual(String(signature), `sha256=${digest}`) ||
    timingSafeStringEqual(String(signature), digest)
  );
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const l = Buffer.from(left);
  const r = Buffer.from(right);
  if (l.length !== r.length) return false;
  return timingSafeEqual(l, r);
}

export interface WebhookAuthInput {
  secret: string;
  rawBody: Buffer;
  headers: Headers;
  searchParams: URLSearchParams;
  maxAgeSeconds?: number;
}

/** Returns whether the webhook request is authorized and how. */
export function isWebhookAuthorized(input: WebhookAuthInput): { ok: boolean; via: string } {
  const { secret, rawBody, headers, searchParams, maxAgeSeconds = 0 } = input;

  // No secret configured → accept (documented opt-in for local/dev).
  if (!secret) return { ok: true, via: "no_secret_configured" };

  const supplied =
    headers.get("x-webhook-secret") ||
    headers.get("x-chatwoot-ops-secret") ||
    searchParams.get("token") ||
    searchParams.get("secret");
  if (supplied && timingSafeStringEqual(String(supplied), secret)) {
    return { ok: true, via: "shared_secret" };
  }

  const signatureOk = verifyHmacSignature({
    secret,
    signature: headers.get("x-chatwoot-signature"),
    timestamp: headers.get("x-chatwoot-timestamp"),
    rawBody,
    maxAgeSeconds,
  });
  if (signatureOk) return { ok: true, via: "hmac_signature" };

  return { ok: false, via: "unauthorized" };
}
