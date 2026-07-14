import { secondsBetween } from "@/lib/time";

/**
 * Correlate one campaign SEND to the reply it actually produced.
 *
 * The chain is:
 *   CampaignJob → CampaignRecipient (convId + msgId from sentTrack)
 *     → the outbound template message in Chatwoot (msgId)  ⇒ sentAt
 *       → the first PUBLIC INCOMING customer message after sentAt  ⇒ the reply
 *         → the first HUMAN agent message after that              ⇒ team response
 *
 * `sentAt` is the whole point. A customer message that arrived BEFORE the
 * template is a reply to something else — an earlier campaign, an earlier
 * conversation — and counting it would silently inflate the reply rate of every
 * campaign sent to an already-chatty contact.
 */

export type CorrelationMethod = "message_id" | "attribute_fallback" | "unmatched";
export type Confidence = "high" | "low";

/** A message reduced to what correlation needs. Mirrors NormalizedMessage. */
export interface CorrelationMessage {
  chatwootId: number;
  createdAt: Date | null;
  /** Public incoming message from the contact. */
  isCustomerIncoming: boolean;
  /** Public outgoing message from an identifiable human agent. */
  isHumanReply: boolean;
  senderId: number | null;
  senderName: string | null;
}

export interface CorrelationResult {
  /** null when the template itself could not be located. */
  sentAt: Date | null;
  replyAt: Date | null;
  firstAgentReplyAt: Date | null;
  /** Customer reply → first human agent reply. */
  responseSeconds: number | null;
  assigneeCwId: number | null;
  assigneeName: string | null;
  replied: boolean;
  method: CorrelationMethod;
  confidence: Confidence;
}

const EMPTY: CorrelationResult = {
  sentAt: null,
  replyAt: null,
  firstAgentReplyAt: null,
  responseSeconds: null,
  assigneeCwId: null,
  assigneeName: null,
  replied: false,
  method: "unmatched",
  confidence: "low",
};

/** Resolve the send timestamp from the template message the uploader recorded. */
export function findSentAt(messages: CorrelationMessage[], messageCwId: number | null | undefined): Date | null {
  if (typeof messageCwId !== "number") return null;
  return messages.find((m) => m.chatwootId === messageCwId)?.createdAt ?? null;
}

/**
 * Given the send time, find the customer's reply and the team's answer to it.
 *
 * `isCustomerIncoming` / `isHumanReply` already exclude private notes,
 * Fahd/Botpress, automation rules, campaign templates and activity messages —
 * see metrics/humanReply.ts. Nothing here re-derives those rules.
 */
export function correlateReply(input: {
  messages: CorrelationMessage[];
  sentAt: Date | null;
  method: CorrelationMethod;
}): CorrelationResult {
  const { sentAt, method } = input;
  if (!sentAt) return { ...EMPTY, method: "unmatched" };

  const confidence: Confidence = method === "message_id" ? "high" : "low";
  const ordered = [...input.messages]
    .filter((m) => m.createdAt !== null)
    .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());

  const sentMs = sentAt.getTime();

  // Strictly after the send. An incoming message that predates the template is
  // not an answer to it.
  const reply = ordered.find((m) => m.isCustomerIncoming && m.createdAt!.getTime() >= sentMs) ?? null;

  if (!reply) {
    return { ...EMPTY, sentAt, method, confidence, replied: false };
  }

  const replyMs = reply.createdAt!.getTime();
  const agent = ordered.find((m) => m.isHumanReply && m.createdAt!.getTime() >= replyMs) ?? null;

  return {
    sentAt,
    replyAt: reply.createdAt,
    firstAgentReplyAt: agent?.createdAt ?? null,
    responseSeconds: agent?.createdAt ? secondsBetween(reply.createdAt!, agent.createdAt) : null,
    assigneeCwId: agent?.senderId ?? null,
    assigneeName: agent?.senderName ?? null,
    replied: true,
    method,
    confidence,
  };
}

/** `job:<jobId>:conv:<id>` — the idempotency key for a precise reply row. */
export function jobDedupeKey(jobId: string, conversationCwId: number): string {
  return `job:${jobId}:conv:${conversationCwId}`;
}

/** `attr:<conv>:<label>` — for the approximate, attribute-derived rows. */
export function attrDedupeKey(conversationCwId: number, label: string | null): string {
  return `attr:${conversationCwId}:${label ?? ""}`;
}
