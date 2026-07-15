import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/env";
import { conversationWhere, type ReportFilters } from "./filters";

const SORTABLE = new Set([
  "lastMessageAt",
  "createdAtCw",
  "responseSeconds",
  "conversationDurationSeconds",
  "status",
  "department",
]);

export interface ConversationsPage {
  rows: Array<{
    chatwootId: number;
    contactName: string | null;
    contactPhone: string | null;
    status: string | null;
    assigneeName: string | null;
    teamName: string | null;
    department: string | null;
    inboxName: string | null;
    responseSeconds: number | null;
    conversationDurationSeconds: number | null;
    campaignLabel: string | null;
    needsReply: boolean;
    botInvolved: boolean;
    unreadCount: number;
    lastMessageAt: Date | null;
    lastMessageType: string | null;
    slaFirstResponseBreached: boolean;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export async function getConversationsPage(
  f: ReportFilters,
  opts: { page?: number; pageSize?: number; sortBy?: string; sortDir?: "asc" | "desc" } = {},
): Promise<ConversationsPage> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 50, 200));
  const sortBy = opts.sortBy && SORTABLE.has(opts.sortBy) ? opts.sortBy : "lastMessageAt";
  const sortDir = opts.sortDir === "asc" ? "asc" : "desc";
  const where = conversationWhere(f);

  const [total, rows] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: { [sortBy]: sortDir } as Prisma.ConversationOrderByWithRelationInput,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        chatwootId: true,
        contactName: true,
        contactPhone: true,
        status: true,
        assigneeName: true,
        teamName: true,
        department: true,
        inboxName: true,
        responseSeconds: true,
        conversationDurationSeconds: true,
        campaignLabel: true,
        needsReply: true,
        botInvolved: true,
        unreadCount: true,
        lastMessageAt: true,
        lastMessageType: true,
        slaFirstResponseBreached: true,
      },
    }),
  ]);

  return { rows, total, page, pageSize };
}

export interface TimelineItem {
  at: Date;
  kind: string; // created | assigned | customer | agent | bot | automation | template | note | resolved | reopened | campaign
  label: string;
  detail?: string | null;
}

export async function getConversationDetail(chatwootId: number) {
  const conversation = await prisma.conversation.findUnique({ where: { chatwootId } });
  if (!conversation) return null;

  const [messages, events, assignmentIntervals, resolutionIntervals, campaignReplies, botHandoffs] = await Promise.all([
    prisma.message.findMany({ where: { conversationCwId: chatwootId }, orderBy: { createdAtCw: "asc" } }),
    prisma.conversationEvent.findMany({ where: { conversationCwId: chatwootId }, orderBy: { occurredAt: "asc" } }),
    prisma.assignmentInterval.findMany({ where: { conversationCwId: chatwootId }, orderBy: { startedAt: "asc" } }),
    prisma.resolutionInterval.findMany({ where: { conversationCwId: chatwootId }, orderBy: { segmentIndex: "asc" } }),
    prisma.campaignReply.findMany({ where: { conversationCwId: chatwootId } }),
    prisma.botHandoff.findMany({ where: { conversationCwId: chatwootId } }),
  ]);

  // Build a merged human-readable timeline.
  const timeline: TimelineItem[] = [];
  if (conversation.createdAtCw) timeline.push({ at: conversation.createdAtCw, kind: "created", label: "بدأت المحادثة" });
  if (conversation.campaignCreatedAt && conversation.campaignLabel) {
    timeline.push({ at: conversation.campaignCreatedAt, kind: "campaign", label: "إرسال كامبين", detail: conversation.campaignLabel });
  }
  for (const e of events) {
    if (e.type === "assigned") timeline.push({ at: e.occurredAt, kind: "assigned", label: "تم الإسناد لموظف", detail: e.toValue });
    else if (e.type === "resolved") timeline.push({ at: e.occurredAt, kind: "resolved", label: "تم الحل" });
    else if (e.type === "reopened") timeline.push({ at: e.occurredAt, kind: "reopened", label: "أُعيد فتحها" });
  }
  for (const m of messages) {
    if (!m.createdAtCw) continue;
    if (m.messageType === 2) continue; // activity
    const kind = m.private
      ? "note"
      : m.isTemplate
        ? "template"
        : m.isBot
          ? "bot"
          : m.isAutomation
            ? "automation"
            : m.messageType === 0
              ? "customer"
              : "agent";
    const label =
      kind === "customer"
        ? "رسالة العميل"
        : kind === "bot"
          ? "رسالة فهد"
          : kind === "automation"
            ? "رسالة آلية"
            : kind === "template"
              ? "قالب كامبين"
              : kind === "note"
                ? "ملاحظة داخلية"
                : "رد الموظف";
    timeline.push({ at: m.createdAtCw, kind, label, detail: m.content?.slice(0, 280) ?? null });
  }
  timeline.sort((a, b) => a.at.getTime() - b.at.getTime());

  const base = env.chatwootBaseUrl();
  const account = env.chatwootAccountId();
  const link = base && account ? `${base}/app/accounts/${account}/conversations/${chatwootId}` : null;

  return { conversation, messages, events, assignmentIntervals, resolutionIntervals, campaignReplies, botHandoffs, timeline, link };
}
