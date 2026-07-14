import { prisma } from "@/lib/db";
import { ChatwootClient } from "@/lib/chatwoot/client";
import { fetchAllMessages } from "@/lib/chatwoot/fetchers";
import { assembleConversation } from "@/lib/metrics/conversation";
import { toDate } from "@/lib/time";
import { buildAssembleContext } from "./context";
import { persistConversation } from "./persist";
import { webhookDedupeKey } from "./dedupe";

interface WebhookBody {
  event?: string;
  id?: number;
  status?: string;
  conversation_id?: number;
  conversation?: { id?: number; status?: string; meta?: { assignee?: { id?: number } | null } };
  message_type?: number | string;
  created_at?: number | string;
  assignee?: { id?: number } | null;
  [key: string]: unknown;
}

const RECOMPUTE_EVENTS = new Set([
  "message_created",
  "message_updated",
  "conversation_created",
  "conversation_updated",
  "conversation_status_changed",
  "conversation_resolved",
  "conversation_reopened",
  "assignee_changed",
  "conversation_typing_off",
]);

export interface WebhookResult {
  ok: boolean;
  duplicate?: boolean;
  stored: boolean;
  reprocessed: boolean;
  conversationCwId: number | null;
  event: string | null;
  reason?: string;
}

/** Ingest a Chatwoot webhook: store raw (idempotent), derive lifecycle events, recompute. */
export async function processWebhook(
  rawBody: Buffer,
  body: WebhookBody,
  signatureOk: boolean,
): Promise<WebhookResult> {
  const event = typeof body.event === "string" ? body.event : null;
  const conversationCwId = extractConversationId(body);
  const messageCwId = event?.startsWith("message") && typeof body.id === "number" ? body.id : null;
  const occurredAt = toDate(body.created_at);
  const dedupeKey = webhookDedupeKey(event, rawBody);

  // Idempotent raw store: a duplicate delivery collides on dedupeKey.
  try {
    await prisma.rawEvent.create({
      data: {
        source: "chatwoot_webhook",
        event,
        dedupeKey,
        signatureOk,
        conversationCwId: conversationCwId ?? undefined,
        messageCwId: messageCwId ?? undefined,
        occurredAt: occurredAt ?? undefined,
        payload: body as object,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: true, duplicate: true, stored: false, reprocessed: false, conversationCwId, event };
    }
    throw error;
  }

  // Capture assignment / status transitions with their timestamps so historical
  // metrics sharpen over time (backfill cannot recover this history).
  await recordLifecycleEvents(body, conversationCwId, occurredAt);

  if (!conversationCwId || !event || !RECOMPUTE_EVENTS.has(event)) {
    return { ok: true, stored: true, reprocessed: false, conversationCwId, event, reason: "no_recompute" };
  }

  try {
    const client = new ChatwootClient();
    const [detail, messages] = await Promise.all([
      client.conversationDetails(conversationCwId),
      fetchAllMessages(client, conversationCwId),
    ]);
    const ctx = await buildAssembleContext(conversationCwId);
    const assembled = assembleConversation(detail, messages, ctx);
    await persistConversation(assembled);
    await prisma.rawEvent.updateMany({ where: { dedupeKey }, data: { processedAt: new Date() } });
    return { ok: true, stored: true, reprocessed: true, conversationCwId, event };
  } catch (error) {
    await prisma.rawEvent.updateMany({
      where: { dedupeKey },
      data: { processError: (error as Error).message?.slice(0, 500) },
    });
    return { ok: true, stored: true, reprocessed: false, conversationCwId, event, reason: "recompute_failed" };
  }
}

function extractConversationId(body: WebhookBody): number | null {
  if (typeof body.conversation?.id === "number") return body.conversation.id;
  if (typeof body.conversation_id === "number") return body.conversation_id;
  // For conversation_* events the payload IS the conversation.
  if (body.event?.startsWith("conversation") && typeof body.id === "number") return body.id;
  return null;
}

async function recordLifecycleEvents(
  body: WebhookBody,
  conversationCwId: number | null,
  occurredAt: Date | null,
): Promise<void> {
  if (!conversationCwId) return;
  const at = occurredAt ?? new Date();
  const event = body.event;
  const events: { type: string; toValue: string | null }[] = [];

  if (event === "assignee_changed" || event === "conversation_updated" || event === "conversation_created") {
    const assigneeId =
      (typeof body.assignee?.id === "number" ? body.assignee.id : null) ??
      (typeof body.conversation?.meta?.assignee?.id === "number" ? body.conversation.meta.assignee.id : null);
    if (event === "assignee_changed") {
      events.push({ type: assigneeId ? "assigned" : "unassigned", toValue: assigneeId ? String(assigneeId) : null });
    } else if (assigneeId) {
      events.push({ type: "assigned", toValue: String(assigneeId) });
    }
  }

  if (event === "conversation_status_changed" || event === "conversation_resolved" || event === "conversation_reopened") {
    const status = String(body.status ?? body.conversation?.status ?? "").toLowerCase();
    const type =
      event === "conversation_resolved" || status === "resolved"
        ? "resolved"
        : event === "conversation_reopened"
          ? "reopened"
          : status === "open"
            ? "open"
            : status || "status_changed";
    events.push({ type, toValue: status || null });
  }

  for (const e of events) {
    const dedupeKey = `${conversationCwId}:${e.type}:${e.toValue ?? ""}:${at.toISOString()}`;
    await prisma.conversationEvent
      .create({
        data: { conversationCwId, type: e.type, toValue: e.toValue, occurredAt: at, dedupeKey },
      })
      .catch((error) => {
        if (!isUniqueViolation(error)) throw error;
      });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}
