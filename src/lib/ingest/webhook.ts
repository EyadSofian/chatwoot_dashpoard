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
  conversation?: {
    id?: number;
    status?: string;
    meta?: { assignee?: { id?: number } | null; team?: { id?: number } | null };
  };
  message_type?: number | string;
  created_at?: number | string;
  updated_at?: number | string;
  assignee?: { id?: number } | null;
  team?: { id?: number } | null;
  meta?: { assignee?: { id?: number } | null; team?: { id?: number } | null };
  changed_attributes?: unknown;
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
  // A conversation webhook's `created_at` is the conversation creation time,
  // not the time of this update. Using it for assignment events moved every
  // reassignment back to day one and corrupted response-time reports.
  const occurredAt = event?.startsWith("conversation")
    ? toDate(body.updated_at) ?? new Date()
    : toDate(body.created_at) ?? new Date();
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
  const events: { type: string; fromValue: string | null; toValue: string | null }[] = [];

  if (event === "conversation_created") {
    events.push({ type: "created", fromValue: null, toValue: null });
    const assigneeId = extractAssigneeId(body);
    if (assigneeId !== null) {
      events.push({ type: "assigned", fromValue: null, toValue: String(assigneeId) });
    }
    const teamId = extractTeamId(body);
    if (teamId !== null) events.push({ type: "team_changed", fromValue: null, toValue: String(teamId) });
  }

  const assigneeChange = changedAttribute(body.changed_attributes, "assignee_id");
  if (event === "assignee_changed" || (event === "conversation_updated" && assigneeChange.changed)) {
    const fromId = idValue(assigneeChange.from);
    const changedToId = idValue(assigneeChange.to);
    const toId = assigneeChange.hasToValue ? changedToId : extractAssigneeId(body);
    events.push({
      type: toId === null ? "unassigned" : "assigned",
      fromValue: fromId === null ? null : String(fromId),
      toValue: toId === null ? null : String(toId),
    });
  }

  const teamChange = changedAttribute(body.changed_attributes, "team_id");
  if (event === "conversation_updated" && teamChange.changed) {
    const fromId = idValue(teamChange.from);
    const changedToId = idValue(teamChange.to);
    const toId = teamChange.hasToValue ? changedToId : extractTeamId(body);
    events.push({
      type: "team_changed",
      fromValue: fromId === null ? null : String(fromId),
      toValue: toId === null ? null : String(toId),
    });
  }

  const statusChange = changedAttribute(body.changed_attributes, "status");
  if (
    event === "conversation_status_changed" ||
    event === "conversation_resolved" ||
    event === "conversation_reopened" ||
    (event === "conversation_updated" && statusChange.changed)
  ) {
    const status = String(
      statusChange.hasToValue ? statusChange.to ?? "" : body.status ?? body.conversation?.status ?? "",
    ).toLowerCase();
    const previousStatus = statusChange.changed ? String(statusChange.from ?? "").toLowerCase() : "";
    const type =
      event === "conversation_resolved" || status === "resolved"
        ? "resolved"
        : event === "conversation_reopened"
          ? "reopened"
          : status === "open"
            ? "open"
            : status || "status_changed";
    events.push({ type, fromValue: previousStatus || null, toValue: status || null });
  }

  for (const e of events) {
    const dedupeKey = `${conversationCwId}:${e.type}:${e.fromValue ?? ""}:${e.toValue ?? ""}:${at.toISOString()}`;
    await prisma.conversationEvent
      .create({
        data: {
          conversationCwId,
          type: e.type,
          fromValue: e.fromValue,
          toValue: e.toValue,
          occurredAt: at,
          dedupeKey,
        },
      })
      .catch((error) => {
        if (!isUniqueViolation(error)) throw error;
      });
  }
}

interface ChangedValue {
  changed: boolean;
  from: unknown;
  to: unknown;
  hasToValue: boolean;
}

/** Supports both Rails `[old, new]` and `{ previous_value, current_value }` payloads. */
function changedAttribute(input: unknown, key: string): ChangedValue {
  let raw: unknown;
  if (Array.isArray(input)) {
    for (const entry of input) {
      if (typeof entry === "string" && entry === key) return { changed: true, from: undefined, to: undefined, hasToValue: false };
      if (entry && typeof entry === "object" && key in entry) {
        raw = (entry as Record<string, unknown>)[key];
        break;
      }
    }
  } else if (input && typeof input === "object" && key in input) {
    raw = (input as Record<string, unknown>)[key];
  }
  if (raw === undefined) return { changed: false, from: undefined, to: undefined, hasToValue: false };
  if (Array.isArray(raw)) {
    return { changed: true, from: raw[0], to: raw[1], hasToValue: raw.length > 1 };
  }
  if (raw && typeof raw === "object") {
    const value = raw as Record<string, unknown>;
    const hasCurrent = "current_value" in value || "to" in value || "new" in value;
    return {
      changed: true,
      from: value.previous_value ?? value.from ?? value.old,
      to: value.current_value ?? value.to ?? value.new,
      hasToValue: hasCurrent,
    };
  }
  return { changed: true, from: undefined, to: raw, hasToValue: true };
}

function idValue(value: unknown): number | null {
  if (value && typeof value === "object" && "id" in value) return idValue((value as { id?: unknown }).id);
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function extractAssigneeId(body: WebhookBody): number | null {
  return firstId(body.meta?.assignee, body.assignee, body.conversation?.meta?.assignee);
}

function extractTeamId(body: WebhookBody): number | null {
  return firstId(body.meta?.team, body.team, body.conversation?.meta?.team);
}

function firstId(...values: Array<{ id?: number } | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value?.id === "number" && value.id > 0) return value.id;
  }
  return null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}
