import { toDate, secondsBetween, businessSecondsBetween, slaState, pendingSlaState, type BusinessHoursConfig } from "@/lib/time";
import type { CwConversation, CwMessage } from "@/lib/chatwoot/types";
import { normalizeMessages, type NormalizedMessage } from "./humanReply";
import { buildAssignmentIntervals, firstResponseFromAssignment, type AssignEvent, type AssignmentIntervalResult } from "./assignment";
import { buildResolutionSegments, totalResolvedDurationSeconds, type StatusEvent, type ResolutionSegment } from "./resolution";
import { inferDepartment } from "./department";
import { correlateCampaign, type CampaignCorrelation } from "./campaign";
import type { Department } from "@/lib/constants";

export interface AssembleContext {
  botAgentIds: Set<number>;
  botLabel: string;
  business: BusinessHoursConfig;
  slaFirstResponseSeconds: number;
  slaResolutionSeconds: number;
  nearBreachRatio: number;
  salesTeamId?: string;
  operationsTeamId?: string;
  complaintsTeamId?: string;
  inboxNameById?: Map<number, string>;
  /** Real assignment history from stored ConversationEvents (optional). */
  assignmentEvents?: AssignEvent[];
  /** Real status history from stored ConversationEvents (optional). */
  statusEvents?: StatusEvent[];
  now?: Date;
}

export interface AssembledConversation {
  conversation: ConversationRecord;
  messages: NormalizedMessage[];
  assignmentIntervals: (AssignmentIntervalResult & { assigneeName: string | null })[];
  resolutionSegments: (ResolutionSegment & { businessSeconds: number | null })[];
  responseMetric: {
    assigneeCwId: number | null;
    assignedAt: Date | null;
    firstReplyAt: Date | null;
    responseSeconds: number | null;
    businessSeconds: number | null;
    breachedSla: boolean;
  };
  campaignReply: CampaignReplyRecord | null;
  botHandoff: BotHandoffRecord | null;
}

export interface ConversationRecord {
  chatwootId: number;
  displayId: number | null;
  accountId: number | null;
  inboxCwId: number | null;
  inboxName: string | null;
  teamCwId: number | null;
  teamName: string | null;
  assigneeCwId: number | null;
  assigneeName: string | null;
  contactCwId: number | null;
  contactName: string | null;
  contactPhone: string | null;
  status: string | null;
  unreadCount: number;
  labels: string[];
  department: Department;
  createdAtCw: Date | null;
  firstOpenedAt: Date | null;
  lastMessageAt: Date | null;
  lastMessageType: string | null;
  lastActivityAt: Date | null;
  resolvedAt: Date | null;
  snoozedUntil: Date | null;
  assignedAt: Date | null;
  firstHumanReplyAt: Date | null;
  responseSeconds: number | null;
  needsReply: boolean;
  handledByHuman: boolean;
  conversationDurationSeconds: number | null;
  conversationBusinessSeconds: number | null;
  campaignLabel: string | null;
  campaignSource: string | null;
  campaignTemplate: string | null;
  campaignStatus: string | null;
  campaignCreatedAt: Date | null;
  isCampaign: boolean;
  botInvolved: boolean;
  botReleaseAt: Date | null;
  slaFirstResponseState: string;
  slaResolutionState: string;
  slaFirstResponseBreached: boolean;
  slaResolutionBreached: boolean;
  customAttributes: Record<string, unknown>;
}

export interface CampaignReplyRecord {
  conversationCwId: number;
  campaignLabel: string;
  campaignSource: string | null;
  template: string | null;
  replyAt: Date | null;
  firstAgentReplyAt: Date | null;
  responseSeconds: number | null;
  assigned: boolean;
  assigneeCwId: number | null;
  assigneeName: string | null;
}

export interface BotHandoffRecord {
  conversationCwId: number;
  dedupeKey: string;
  handoffAt: Date;
  reentry: boolean;
  department: string;
  routedTeamCwId: number | null;
  queuedUnassigned: boolean;
  gotAgentReply: boolean;
  firstAgentReplyAt: Date | null;
  handoffToReplySeconds: number | null;
}

const DIR: Record<number, string> = { 0: "incoming", 1: "outgoing", 2: "activity", 3: "template" };

/** Deterministically compute all metrics for a conversation from its detail + messages. */
export function assembleConversation(
  conv: CwConversation,
  rawMessages: CwMessage[],
  ctx: AssembleContext,
): AssembledConversation {
  const now = ctx.now ?? new Date();
  const attrs = (conv.custom_attributes || {}) as Record<string, unknown>;
  const messages = normalizeMessages(rawMessages, ctx.botAgentIds);

  const createdAtCw = toDate(conv.created_at) ?? messages.find((m) => m.createdAt)?.createdAt ?? now;

  const assignee = conv.meta?.assignee ?? null;
  const assigneeCwId = typeof assignee?.id === "number" ? assignee.id : null;
  const assigneeName = assignee?.name ?? assignee?.available_name ?? null;

  const teamCwId =
    (typeof conv.meta?.team?.id === "number" ? conv.meta.team.id : null) ??
    (typeof conv.team_id === "number" ? conv.team_id : null);
  const teamName = conv.meta?.team?.name ?? null;

  const contact = conv.meta?.sender ?? conv.contact ?? null;
  const contactCwId = typeof contact?.id === "number" ? contact.id : null;
  const contactName = contact?.name ?? null;
  const contactPhone = contact?.phone_number ?? null;

  const inboxCwId = typeof conv.inbox_id === "number" ? conv.inbox_id : null;
  const inboxName = inboxCwId != null ? ctx.inboxNameById?.get(inboxCwId) ?? null : null;

  const status = conv.status ?? null;
  const labels = Array.isArray(conv.labels) ? conv.labels : [];

  const department = inferDepartment({
    customAttributes: attrs,
    teamId: teamCwId,
    teamName,
    inboxName,
    salesTeamId: ctx.salesTeamId,
    operationsTeamId: ctx.operationsTeamId,
    complaintsTeamId: ctx.complaintsTeamId,
  });

  const campaign = correlateCampaign(attrs);

  // ── Messages timeline ──
  const humanReplies = messages.filter((m) => m.isHumanReply && m.createdAt);
  const customerIncoming = messages.filter((m) => m.isCustomerIncoming && m.createdAt);
  const contentMessages = messages.filter((m) => m.messageType !== 2 && m.createdAt);
  const lastContent = contentMessages[contentMessages.length - 1] ?? null;
  const lastMessageAt = lastContent?.createdAt ?? toDate(conv.last_activity_at);
  const lastMessageType = lastContent?.messageType != null ? DIR[lastContent.messageType] ?? null : null;

  const firstHumanReplyAtAny = humanReplies[0]?.createdAt ?? null;
  const handledByHuman = Boolean(firstHumanReplyAtAny);

  // ── Resolution segments ──
  const statusEvents: StatusEvent[] = ctx.statusEvents?.length
    ? ctx.statusEvents
    : synthesizeStatusEvents(status, toDate(conv.last_activity_at), now);
  const segments = buildResolutionSegments(createdAtCw, statusEvents);
  const segmentsWithBusiness = segments.map((s) => ({
    ...s,
    businessSeconds: s.resolvedAt ? businessSecondsBetween(s.openedAt, s.resolvedAt, ctx.business) : null,
  }));
  const resolvedAt =
    status === "resolved" ? segmentsWithBusiness.filter((s) => s.resolvedAt).at(-1)?.resolvedAt ?? null : null;
  const conversationDurationSeconds = totalResolvedDurationSeconds(segments);
  const conversationBusinessSeconds =
    segmentsWithBusiness.filter((s) => s.businessSeconds !== null).reduce((sum, s) => sum + (s.businessSeconds ?? 0), 0) ||
    (conversationDurationSeconds !== null ? 0 : null);

  // ── Assignment intervals + response ──
  const endBoundary = resolvedAt ?? now;
  const assignmentEvents: AssignEvent[] = ctx.assignmentEvents?.length
    ? ctx.assignmentEvents
    : assigneeCwId != null
      ? [{ assigneeId: assigneeCwId, at: createdAtCw }]
      : [];
  const intervals = buildAssignmentIntervals(
    assignmentEvents,
    humanReplies.map((m) => ({ senderId: m.senderId, at: m.createdAt! })),
    endBoundary,
  );
  const intervalsNamed = intervals.map((i) => ({
    ...i,
    assigneeName: i.assigneeId === assigneeCwId ? assigneeName : null,
  }));
  const firstResp = firstResponseFromAssignment(intervals);
  const assignedAt = firstResp.assignedAt;
  const firstHumanReplyAt = firstResp.firstReplyAt ?? firstHumanReplyAtAny;
  const responseSeconds = firstResp.responseSeconds;
  const responseBusinessSeconds =
    assignedAt && firstResp.firstReplyAt
      ? businessSecondsBetween(assignedAt, firstResp.firstReplyAt, ctx.business)
      : null;

  // ── needs reply ──
  const lastCustomerAt = customerIncoming.at(-1)?.createdAt ?? null;
  const lastHumanReplyAt = humanReplies.at(-1)?.createdAt ?? null;
  const needsReply =
    status !== "resolved" &&
    Boolean(lastCustomerAt) &&
    (!lastHumanReplyAt || lastCustomerAt!.getTime() > lastHumanReplyAt.getTime());

  // ── bot involvement ──
  const botReleaseAt = toDate(attrs["engosoft_bot_release"]);
  const hasBotMessage = messages.some((m) => m.isBot);
  const botInvolved = hasBotMessage || labels.includes(ctx.botLabel) || Boolean(botReleaseAt);

  // ── SLA ──
  const responseForSla = responseBusinessSeconds ?? responseSeconds;
  let slaFirstResponseState: string;
  let slaFirstResponseBreached: boolean;
  if (responseForSla !== null && responseForSla !== undefined) {
    slaFirstResponseState = slaState(responseForSla, ctx.slaFirstResponseSeconds, ctx.nearBreachRatio);
    slaFirstResponseBreached = slaFirstResponseState === "breached";
  } else if (needsReply && assignedAt) {
    const elapsed = businessSecondsBetween(assignedAt, now, ctx.business);
    slaFirstResponseState = pendingSlaState(elapsed, ctx.slaFirstResponseSeconds, ctx.nearBreachRatio);
    slaFirstResponseBreached = slaFirstResponseState === "breached";
  } else {
    slaFirstResponseState = "healthy";
    slaFirstResponseBreached = false;
  }

  const resolutionForSla = conversationBusinessSeconds ?? conversationDurationSeconds;
  let slaResolutionState: string;
  let slaResolutionBreached: boolean;
  if (resolvedAt && resolutionForSla !== null && resolutionForSla !== undefined) {
    slaResolutionState = slaState(resolutionForSla, ctx.slaResolutionSeconds, ctx.nearBreachRatio);
    slaResolutionBreached = slaResolutionState === "breached";
  } else if (status !== "resolved") {
    const elapsed = businessSecondsBetween(createdAtCw, now, ctx.business);
    slaResolutionState = pendingSlaState(elapsed, ctx.slaResolutionSeconds, ctx.nearBreachRatio);
    slaResolutionBreached = slaResolutionState === "breached";
  } else {
    slaResolutionState = "healthy";
    slaResolutionBreached = false;
  }

  // ── campaign reply ──
  let campaignReply: CampaignReplyRecord | null = null;
  if (campaign.isCampaign && campaign.campaignLabel) {
    const sendAt = campaign.campaignCreatedAt ?? createdAtCw;
    const replyMsg = customerIncoming.find((m) => m.createdAt && m.createdAt.getTime() >= sendAt.getTime()) ?? customerIncoming[0] ?? null;
    const replyAt = replyMsg?.createdAt ?? null;
    const agentReply = replyAt
      ? humanReplies.find((m) => m.createdAt && m.createdAt.getTime() >= replyAt.getTime()) ?? null
      : null;
    campaignReply = {
      conversationCwId: conv.id,
      campaignLabel: campaign.campaignLabel,
      campaignSource: resolveCampaignSource(campaign, ctx),
      template: campaign.campaignTemplate,
      replyAt,
      firstAgentReplyAt: agentReply?.createdAt ?? null,
      responseSeconds: replyAt && agentReply?.createdAt ? secondsBetween(replyAt, agentReply.createdAt) : null,
      assigned: Boolean(campaign.reply.assignedAt || assigneeCwId),
      assigneeCwId: campaign.reply.assigneeId ?? assigneeCwId,
      assigneeName: campaign.reply.assigneeName ?? assigneeName,
    };
  }

  // ── bot handoff ──
  let botHandoff: BotHandoffRecord | null = null;
  if (botInvolved) {
    const handoffAt = botReleaseAt ?? createdAtCw;
    const agentReply = humanReplies.find((m) => m.createdAt && m.createdAt.getTime() >= handoffAt.getTime()) ?? null;
    botHandoff = {
      conversationCwId: conv.id,
      dedupeKey: `${conv.id}:${handoffAt.toISOString()}`,
      handoffAt,
      reentry: Boolean(botReleaseAt),
      department,
      routedTeamCwId: teamCwId,
      queuedUnassigned: assigneeCwId === null && status !== "resolved",
      gotAgentReply: Boolean(agentReply),
      firstAgentReplyAt: agentReply?.createdAt ?? null,
      handoffToReplySeconds: agentReply?.createdAt ? secondsBetween(handoffAt, agentReply.createdAt) : null,
    };
  }

  const conversation: ConversationRecord = {
    chatwootId: conv.id,
    displayId: typeof conv.display_id === "number" ? conv.display_id : null,
    accountId: typeof conv.account_id === "number" ? conv.account_id : null,
    inboxCwId,
    inboxName,
    teamCwId,
    teamName,
    assigneeCwId,
    assigneeName,
    contactCwId,
    contactName,
    contactPhone,
    status,
    unreadCount: typeof conv.unread_count === "number" ? conv.unread_count : 0,
    labels,
    department,
    createdAtCw,
    firstOpenedAt: segments[0]?.openedAt ?? createdAtCw,
    lastMessageAt,
    lastMessageType,
    lastActivityAt: toDate(conv.last_activity_at) ?? lastMessageAt,
    resolvedAt,
    snoozedUntil: toDate(conv.snoozed_until),
    assignedAt,
    firstHumanReplyAt,
    responseSeconds,
    needsReply,
    handledByHuman,
    conversationDurationSeconds,
    conversationBusinessSeconds,
    campaignLabel: campaign.campaignLabel,
    campaignSource: campaignReply?.campaignSource ?? resolveCampaignSource(campaign, ctx),
    campaignTemplate: campaign.campaignTemplate,
    campaignStatus: campaign.campaignStatus,
    campaignCreatedAt: campaign.campaignCreatedAt,
    isCampaign: campaign.isCampaign,
    botInvolved,
    botReleaseAt,
    slaFirstResponseState,
    slaResolutionState,
    slaFirstResponseBreached,
    slaResolutionBreached,
    customAttributes: attrs,
  };

  return {
    conversation,
    messages,
    assignmentIntervals: intervalsNamed,
    resolutionSegments: segmentsWithBusiness,
    responseMetric: {
      assigneeCwId: firstResp.assigneeId ?? assigneeCwId,
      assignedAt,
      firstReplyAt: firstResp.firstReplyAt,
      responseSeconds,
      businessSeconds: responseBusinessSeconds,
      breachedSla: slaFirstResponseBreached,
    },
    campaignReply,
    botHandoff,
  };
}

function synthesizeStatusEvents(status: string | null, lastActivityAt: Date | null, now: Date): StatusEvent[] {
  if (status === "resolved") {
    return [{ type: "resolved", at: lastActivityAt ?? now }];
  }
  return [];
}

function resolveCampaignSource(campaign: CampaignCorrelation, ctx: AssembleContext): string | null {
  const teamId = campaign.reply.teamId;
  if (teamId) {
    if (ctx.salesTeamId && teamId === ctx.salesTeamId) return "sales";
    if (ctx.operationsTeamId && teamId === ctx.operationsTeamId) return "operations";
  }
  return null;
}
