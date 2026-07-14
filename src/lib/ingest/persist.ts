import { prisma } from "@/lib/db";
import type { AssembledConversation } from "@/lib/metrics/conversation";

/**
 * Persist an assembled conversation idempotently. Denormalized metrics are
 * recomputed in full, so reprocessing the same (or a duplicate) event yields
 * the same rows and never double-counts.
 */
export async function persistConversation(assembled: AssembledConversation): Promise<bigint> {
  const c = assembled.conversation;

  const conv = await prisma.conversation.upsert({
    where: { chatwootId: c.chatwootId },
    create: mapConversation(c),
    update: mapConversation(c),
    select: { id: true },
  });
  const conversationId = conv.id;
  const conversationCwId = c.chatwootId;

  // Messages: insert new ones (immutable timeline); classification is recomputed
  // on the conversation itself so partial → full backfill still converges.
  if (assembled.messages.length) {
    await prisma.message.createMany({
      skipDuplicates: true,
      data: assembled.messages.map((m) => ({
        chatwootId: m.chatwootId,
        conversationId,
        conversationCwId,
        messageType: m.messageType,
        contentType: m.contentType,
        private: m.private,
        content: m.content,
        senderType: m.senderType,
        senderId: m.senderId,
        senderName: m.senderName,
        isTemplate: m.isTemplate,
        isBot: m.isBot,
        isHumanReply: m.isHumanReply,
        createdAtCw: m.createdAt,
      })),
    });
  }

  // Assignment intervals — fully recomputed, so replace.
  await prisma.assignmentInterval.deleteMany({ where: { conversationCwId } });
  if (assembled.assignmentIntervals.length) {
    await prisma.assignmentInterval.createMany({
      skipDuplicates: true,
      data: assembled.assignmentIntervals.map((i) => ({
        conversationId,
        conversationCwId,
        assigneeCwId: i.assigneeId,
        assigneeName: i.assigneeName,
        startedAt: i.startedAt,
        endedAt: i.endedAt,
        firstReplyAt: i.firstReplyAt,
        responseSeconds: i.responseSeconds,
        responded: i.responded,
      })),
    });
  }

  // Resolution segments — fully recomputed, so replace.
  await prisma.resolutionInterval.deleteMany({ where: { conversationCwId } });
  if (assembled.resolutionSegments.length) {
    await prisma.resolutionInterval.createMany({
      skipDuplicates: true,
      data: assembled.resolutionSegments.map((s) => ({
        conversationId,
        conversationCwId,
        segmentIndex: s.segmentIndex,
        openedAt: s.openedAt,
        resolvedAt: s.resolvedAt,
        durationSeconds: s.durationSeconds,
        businessSeconds: s.businessSeconds,
      })),
    });
  }

  // Response metric (one per conversation).
  const rm = assembled.responseMetric;
  await prisma.responseMetric.upsert({
    where: { conversationCwId },
    create: {
      conversationId,
      conversationCwId,
      assigneeCwId: rm.assigneeCwId,
      assignedAt: rm.assignedAt,
      firstReplyAt: rm.firstReplyAt,
      responseSeconds: rm.responseSeconds,
      businessSeconds: rm.businessSeconds,
      breachedSla: rm.breachedSla,
    },
    update: {
      assigneeCwId: rm.assigneeCwId,
      assignedAt: rm.assignedAt,
      firstReplyAt: rm.firstReplyAt,
      responseSeconds: rm.responseSeconds,
      businessSeconds: rm.businessSeconds,
      breachedSla: rm.breachedSla,
      computedAt: new Date(),
    },
  });

  // Campaign reply correlation.
  if (assembled.campaignReply) {
    const cr = assembled.campaignReply;
    await prisma.campaignReply.upsert({
      where: { conversationCwId_campaignLabel: { conversationCwId, campaignLabel: cr.campaignLabel } },
      create: { conversationId, ...cr },
      update: {
        campaignSource: cr.campaignSource,
        template: cr.template,
        replyAt: cr.replyAt,
        firstAgentReplyAt: cr.firstAgentReplyAt,
        responseSeconds: cr.responseSeconds,
        assigned: cr.assigned,
        assigneeCwId: cr.assigneeCwId,
        assigneeName: cr.assigneeName,
      },
    });
  }

  // Bot (Fahd) handoff.
  if (assembled.botHandoff) {
    const bh = assembled.botHandoff;
    await prisma.botHandoff.upsert({
      where: { dedupeKey: bh.dedupeKey },
      create: { conversationId, ...bh },
      update: {
        department: bh.department,
        routedTeamCwId: bh.routedTeamCwId,
        queuedUnassigned: bh.queuedUnassigned,
        gotAgentReply: bh.gotAgentReply,
        firstAgentReplyAt: bh.firstAgentReplyAt,
        handoffToReplySeconds: bh.handoffToReplySeconds,
        reentry: bh.reentry,
      },
    });
  }

  return conversationId;
}

function mapConversation(c: AssembledConversation["conversation"]) {
  return {
    chatwootId: c.chatwootId,
    displayId: c.displayId,
    accountId: c.accountId,
    inboxCwId: c.inboxCwId,
    inboxName: c.inboxName,
    teamCwId: c.teamCwId,
    teamName: c.teamName,
    assigneeCwId: c.assigneeCwId,
    assigneeName: c.assigneeName,
    contactCwId: c.contactCwId,
    contactName: c.contactName,
    contactPhone: c.contactPhone,
    status: c.status,
    unreadCount: c.unreadCount,
    labels: c.labels,
    department: c.department,
    createdAtCw: c.createdAtCw,
    firstOpenedAt: c.firstOpenedAt,
    lastMessageAt: c.lastMessageAt,
    lastMessageType: c.lastMessageType,
    lastActivityAt: c.lastActivityAt,
    resolvedAt: c.resolvedAt,
    snoozedUntil: c.snoozedUntil,
    assignedAt: c.assignedAt,
    firstHumanReplyAt: c.firstHumanReplyAt,
    responseSeconds: c.responseSeconds,
    needsReply: c.needsReply,
    handledByHuman: c.handledByHuman,
    conversationDurationSeconds: c.conversationDurationSeconds,
    conversationBusinessSeconds: c.conversationBusinessSeconds,
    campaignLabel: c.campaignLabel,
    campaignSource: c.campaignSource,
    campaignTemplate: c.campaignTemplate,
    campaignStatus: c.campaignStatus,
    campaignCreatedAt: c.campaignCreatedAt,
    isCampaign: c.isCampaign,
    botInvolved: c.botInvolved,
    botReleaseAt: c.botReleaseAt,
    slaFirstResponseState: c.slaFirstResponseState,
    slaResolutionState: c.slaResolutionState,
    slaFirstResponseBreached: c.slaFirstResponseBreached,
    slaResolutionBreached: c.slaResolutionBreached,
    customAttributes: (c.customAttributes ?? {}) as object,
  } as Parameters<typeof prisma.conversation.upsert>[0]["create"];
}
