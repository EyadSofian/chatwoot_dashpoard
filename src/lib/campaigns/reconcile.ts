import { prisma } from "@/lib/db";
import { ChatwootClient } from "@/lib/chatwoot/client";
import { fetchAllMessages } from "@/lib/chatwoot/fetchers";
import { assembleConversation } from "@/lib/metrics/conversation";
import { buildAssembleContext } from "@/lib/ingest/context";
import { persistConversation } from "@/lib/ingest/persist";
import { correlateReply, findSentAt, jobDedupeKey, type CorrelationMessage } from "./correlate";

export interface ReconcileStats {
  jobs: number;
  recipients: number;
  /** Recipients whose outbound template message we found in Chatwoot. */
  matched: number;
  /** Precise (message_id) customer replies. */
  customerReplies: number;
  /** Recipients we could not tie to a message. */
  messageMissing: number;
  /** Sent recipients with no conversation id from the uploader at all. */
  noConversation: number;
  /** Conversations pulled from Chatwoot because we had no messages locally. */
  fetchedFromChatwoot: number;
  errors: string[];
}

export interface ReconcileOptions {
  /** Only jobs created at/after this. Omit for a full historical pass. */
  since?: Date;
  /** Cap the work per run so a cron tick stays bounded. */
  maxJobs?: number;
  maxConversationFetches?: number;
}

const toCorrelationMessages = (
  rows: { chatwootId: number; createdAtCw: Date | null; messageType: number | null; private: boolean; isTemplate: boolean; isAutomation: boolean; isBot: boolean; isHumanReply: boolean; senderId: number | null; senderName: string | null }[],
): CorrelationMessage[] =>
  rows.map((m) => ({
    chatwootId: m.chatwootId,
    createdAt: m.createdAtCw,
    // Stored flags already encode every exclusion (notes, Fahd, automation,
    // templates, activity) — see metrics/humanReply.ts.
    isCustomerIncoming: m.messageType === 0 && !m.private,
    isHumanReply: m.isHumanReply,
    senderId: m.senderId,
    senderName: m.senderName,
  }));

/**
 * Tie every campaign send to the reply it produced.
 *
 * Runs after the campaign import. Idempotent: reply rows are keyed by
 * `job:<jobId>:conv:<id>`, so a second pass updates the same row instead of
 * counting the reply twice. That also makes it safe on a 10-minute cron, and it
 * is what repairs the gap whenever the webhook was down or not yet installed.
 */
export async function reconcileCampaignReplies(opts: ReconcileOptions = {}): Promise<ReconcileStats> {
  const maxJobs = Math.max(1, Math.min(opts.maxJobs ?? 200, 1000));
  const maxFetches = Math.max(0, Math.min(opts.maxConversationFetches ?? 150, 2000));

  const stats: ReconcileStats = {
    jobs: 0,
    recipients: 0,
    matched: 0,
    customerReplies: 0,
    messageMissing: 0,
    noConversation: 0,
    fetchedFromChatwoot: 0,
    errors: [],
  };

  const jobs = await prisma.campaignJob.findMany({
    where: {
      type: "send",
      ...(opts.since ? { createdAtApp: { gte: opts.since } } : {}),
    },
    orderBy: { createdAtApp: "desc" },
    take: maxJobs,
    select: { id: true, jobId: true, sourceKey: true, labelName: true, templateName: true },
  });

  let client: ChatwootClient | null = null;
  let ctx: Awaited<ReturnType<typeof buildAssembleContext>> | null = null;
  let fetches = 0;

  for (const job of jobs) {
    stats.jobs++;

    const recipients = await prisma.campaignRecipient.findMany({
      where: { campaignJobId: job.id, status: "sent" },
      select: { id: true, conversationCwId: true, messageCwId: true, phone: true },
      take: 20000,
    });

    for (const r of recipients) {
      stats.recipients++;

      if (r.conversationCwId === null) {
        stats.noConversation++;
        await prisma.campaignRecipient.update({
          where: { id: r.id },
          data: { correlationState: "no_conversation" },
        });
        continue;
      }

      try {
        let messages = await loadMessages(r.conversationCwId);

        // The template message is the anchor. If it is not stored locally, pull
        // the conversation from Chatwoot once and try again — this is what makes
        // reconciliation independent of the webhook ever having been connected.
        const needsFetch =
          messages.length === 0 ||
          (typeof r.messageCwId === "number" && !messages.some((m) => m.chatwootId === r.messageCwId));

        if (needsFetch && fetches < maxFetches) {
          client ??= new ChatwootClient();
          ctx ??= await buildAssembleContext();
          fetches++;
          stats.fetchedFromChatwoot++;

          const [detail, raw] = await Promise.all([
            client.conversationDetails(r.conversationCwId),
            fetchAllMessages(client, r.conversationCwId),
          ]);
          await persistConversation(assembleConversation(detail, raw, { ...ctx, now: new Date() }));
          messages = await loadMessages(r.conversationCwId);
        }

        const sentAt = findSentAt(messages, r.messageCwId);

        if (!sentAt) {
          stats.messageMissing++;
          await prisma.campaignRecipient.update({
            where: { id: r.id },
            data: { correlationState: "message_missing" },
          });
          continue;
        }

        stats.matched++;
        const result = correlateReply({ messages, sentAt, method: "message_id" });

        await prisma.campaignRecipient.update({
          where: { id: r.id },
          data: { sentAt, correlationState: "matched" },
        });

        // Only a real reply gets a row. "Sent, no answer" is the absence of a
        // reply row, not a row with zeros — the reply rate depends on that.
        if (!result.replied) {
          await prisma.campaignReply.deleteMany({
            where: { campaignJobId: job.id, conversationCwId: r.conversationCwId },
          });
          continue;
        }

        stats.customerReplies++;

        const conversation = await prisma.conversation.findUnique({
          where: { chatwootId: r.conversationCwId },
          select: { id: true, assigneeCwId: true, assigneeName: true },
        });
        if (!conversation) {
          stats.messageMissing++;
          continue;
        }

        const dedupeKey = jobDedupeKey(job.jobId, r.conversationCwId);
        const data = {
          conversationId: conversation.id,
          conversationCwId: r.conversationCwId,
          campaignJobId: job.id,
          campaignRecipientId: r.id,
          campaignMessageCwId: r.messageCwId,
          sentAt,
          correlationMethod: "message_id",
          confidence: "high",
          // Source is the JOB's, always — never a team marker that may not exist.
          campaignSource: job.sourceKey,
          campaignLabel: job.labelName,
          template: job.templateName,
          replyAt: result.replyAt,
          firstAgentReplyAt: result.firstAgentReplyAt,
          responseSeconds: result.responseSeconds,
          assigned: Boolean(result.assigneeCwId ?? conversation.assigneeCwId),
          assigneeCwId: result.assigneeCwId ?? conversation.assigneeCwId,
          assigneeName: result.assigneeName ?? conversation.assigneeName,
        };

        await prisma.campaignReply.upsert({
          where: { dedupeKey },
          create: { dedupeKey, ...data },
          update: data,
        });
      } catch (error) {
        stats.errors.push(`${job.sourceKey}/${job.jobId} ${r.phone ?? ""}: ${(error as Error).message}`.slice(0, 200));
      }
    }

    await prisma.campaignJob.update({ where: { id: job.id }, data: { reconciledAt: new Date() } });
  }

  return stats;
}

async function loadMessages(conversationCwId: number) {
  const rows = await prisma.message.findMany({
    where: { conversationCwId },
    orderBy: { createdAtCw: "asc" },
    take: 2000,
    select: {
      chatwootId: true,
      createdAtCw: true,
      messageType: true,
      private: true,
      isTemplate: true,
      isAutomation: true,
      isBot: true,
      isHumanReply: true,
      senderId: true,
      senderName: true,
    },
  });
  return toCorrelationMessages(rows);
}
