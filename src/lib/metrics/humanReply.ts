import { toDate } from "@/lib/time";
import { MESSAGE_TYPE } from "@/lib/constants";
import type { CwMessage } from "@/lib/chatwoot/types";

export interface NormalizedMessage {
  chatwootId: number;
  messageType: number | null;
  contentType: string | null;
  private: boolean;
  content: string | null;
  senderType: string | null;
  senderId: number | null;
  senderName: string | null;
  createdAt: Date | null;
  isTemplate: boolean;
  isBot: boolean;
  isHumanReply: boolean;
  isCustomerIncoming: boolean;
}

/**
 * Classify a single Chatwoot message. The crucial rule for Engosoft:
 * a "human reply" is a PUBLIC OUTGOING message that is NOT a private note,
 * NOT a WhatsApp campaign template, and NOT sent by Fahd/Botpress or any
 * agent_bot. Everything else (incoming, activity, template, bot) is excluded.
 */
export function classifyMessage(raw: CwMessage, botAgentIds: Set<number>): NormalizedMessage {
  const messageType = typeof raw.message_type === "number" ? raw.message_type : null;
  const isPrivate = raw.private === true;
  const senderType = String(raw.sender?.type || raw.sender_type || "").toLowerCase() || null;
  const senderId = typeof raw.sender?.id === "number" ? raw.sender.id : null;
  const templateParams = raw.content_attributes?.template_params;

  const isTemplate =
    messageType === MESSAGE_TYPE.template ||
    (templateParams !== undefined && templateParams !== null);

  const isBotSender =
    (senderType !== null && senderType.includes("agent_bot")) ||
    (senderId !== null && botAgentIds.has(senderId));

  const isOutgoingPublic = messageType === MESSAGE_TYPE.outgoing && !isPrivate;
  const isBot = isOutgoingPublic && isBotSender;
  const isHumanReply = isOutgoingPublic && !isTemplate && !isBot;
  const isCustomerIncoming = messageType === MESSAGE_TYPE.incoming && !isPrivate;

  return {
    chatwootId: raw.id,
    messageType,
    contentType: raw.content_type ?? null,
    private: isPrivate,
    content: raw.content ?? null,
    senderType,
    senderId,
    senderName: raw.sender?.name ?? raw.sender?.available_name ?? null,
    createdAt: toDate(raw.created_at),
    isTemplate,
    isBot,
    isHumanReply,
    isCustomerIncoming,
  };
}

export function normalizeMessages(messages: CwMessage[], botAgentIds: Set<number>): NormalizedMessage[] {
  return messages
    .map((m) => classifyMessage(m, botAgentIds))
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
}
