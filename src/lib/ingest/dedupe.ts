import { createHash } from "node:crypto";

/**
 * Stable idempotency key for a Chatwoot webhook delivery. Two identical
 * deliveries (same event + byte-identical body) hash to the same key, so the
 * unique constraint on raw_events.dedupeKey rejects the duplicate and no metric
 * is counted twice.
 */
export function webhookDedupeKey(event: string | null | undefined, rawBody: Buffer | string): string {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8");
  return createHash("sha256")
    .update(`${event ?? ""}\n`)
    .update(body)
    .digest("hex");
}
