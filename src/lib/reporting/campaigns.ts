import { prisma } from "@/lib/db";
import { average } from "@/lib/format";
import type { ReportFilters } from "./filters";

/**
 * Campaign performance, keyed to the SEND — never to the label.
 *
 * The old report grouped replies by `campaignSource:campaignLabel`, where
 * campaignSource came from the `api_campaign_reply_team_id` custom attribute.
 * The uploader only writes that attribute when reply auto-assignment is
 * configured, so for most campaigns it is absent, the source came out null, and
 * Sales/Operations both reported 0 replies even when customers had answered.
 *
 * Source now comes from CampaignJob.sourceKey, which always exists, and replies
 * are joined on campaignJobId — so two jobs sharing a label stay separate, and
 * the same customer messaged by two campaigns counts once per campaign.
 */

export type CampaignDataState =
  | "ok"
  | "not_synced" // the uploader app was never imported
  | "not_reconciled" // sends imported, but not yet matched to Chatwoot messages
  | "no_replies"; // matched, and genuinely nobody answered

export interface CampaignRow {
  sourceKey: string; // sales | operations — from the job, always
  jobId: string;
  label: string | null;
  template: string | null;
  operatorName: string | null;
  inboxName: string | null;
  status: string | null;
  statusBucket: string | null;
  createdAt: Date | null;
  reconciledAt: Date | null;

  total: number;
  sent: number;
  failed: number;
  skipped: number;
  deliveryFailures: number;

  /** Recipients tied to a real Chatwoot message — the denominator we trust. */
  matchedRecipients: number;
  /** Distinct recipients who replied (precise, message-anchored). */
  customerReplies: number;
  /** customerReplies ÷ sent. */
  replyRate: number;
  /** Of those repliers, how many got a human answer. */
  teamReplied: number;
  /** Customer reply → first human agent reply. */
  avgTeamResponseSeconds: number | null;
  /** Replied, but nobody is assigned to them. */
  unassigned: number;
  /** Sent recipients we could not anchor to a message. */
  unmatched: number;

  agents: string[];
  dataState: CampaignDataState;
}

export interface CampaignTotals {
  sent: number;
  failed: number;
  customerReplies: number;
  replyRate: number;
  teamReplied: number;
  unmatched: number;
  /** Replies that LANDED inside the window, regardless of when the send went out. */
  repliesInPeriod: number;
}

export interface CampaignsResult {
  rows: CampaignRow[];
  totals: CampaignTotals;
  meta: {
    lastCampaignSyncAt: Date | null;
    lastReconciledAt: Date | null;
    /** No campaign jobs at all ⇒ the uploader apps were never synced. */
    synced: boolean;
  };
}

export async function getCampaigns(f: ReportFilters): Promise<CampaignsResult> {
  const sourceFilter = f.campaignSource?.length ? { sourceKey: { in: f.campaignSource } } : {};

  // Cohort: campaigns SENT in the window. Their replies are then counted however
  // long they took (up to the window's end) — a campaign sent on the 30th whose
  // replies land on the 31st is not a campaign with a 0% reply rate.
  const jobs = await prisma.campaignJob.findMany({
    where: {
      type: "send",
      createdAtApp: { gte: f.from, lte: f.to },
      ...sourceFilter,
      ...(f.campaignLabel?.length ? { labelName: { in: f.campaignLabel } } : {}),
    },
    orderBy: { createdAtApp: "desc" },
    take: 1000,
  });

  const jobIds = jobs.map((j) => j.id);

  const [replies, recipientStates, lastSync, repliesInPeriod] = await Promise.all([
    jobIds.length
      ? prisma.campaignReply.findMany({
          where: { campaignJobId: { in: jobIds }, replyAt: { lte: f.to } },
          select: {
            campaignJobId: true,
            conversationCwId: true,
            assigned: true,
            assigneeName: true,
            responseSeconds: true,
            firstAgentReplyAt: true,
          },
          take: 100000,
        })
      : Promise.resolve([]),
    jobIds.length
      ? prisma.campaignRecipient.groupBy({
          by: ["campaignJobId", "correlationState"],
          where: { campaignJobId: { in: jobIds }, status: "sent" },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.syncRun.findFirst({
      where: { type: "campaign_sync", status: { in: ["success", "partial"] } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
    // Volume, not cohort: replies that arrived during the window.
    prisma.campaignReply.count({
      where: { correlationMethod: "message_id", replyAt: { gte: f.from, lte: f.to } },
    }),
  ]);

  const byJob = new Map<string, typeof replies>();
  for (const r of replies) {
    const key = String(r.campaignJobId);
    const list = byJob.get(key) ?? [];
    list.push(r);
    byJob.set(key, list);
  }

  const matchedByJob = new Map<string, number>();
  const unmatchedByJob = new Map<string, number>();
  for (const g of recipientStates) {
    const key = String(g.campaignJobId);
    const n = g._count._all;
    if (g.correlationState === "matched") matchedByJob.set(key, (matchedByJob.get(key) ?? 0) + n);
    else unmatchedByJob.set(key, (unmatchedByJob.get(key) ?? 0) + n);
  }

  const rows: CampaignRow[] = jobs.map((job) => {
    const key = String(job.id);
    const list = byJob.get(key) ?? [];

    // Distinct conversations — one recipient replying twice is still one reply.
    const repliedConvs = new Set(list.map((r) => r.conversationCwId));
    const customerReplies = repliedConvs.size;

    const teamReplied = list.filter((r) => r.firstAgentReplyAt !== null).length;
    const resp = list.map((r) => r.responseSeconds).filter((v): v is number => v !== null);
    const unassigned = list.filter((r) => !r.assigned).length;
    const agents = [...new Set(list.map((r) => r.assigneeName).filter((n): n is string => Boolean(n)))];

    const matched = matchedByJob.get(key) ?? 0;
    const unmatched = unmatchedByJob.get(key) ?? 0;

    const dataState: CampaignDataState =
      job.reconciledAt === null
        ? "not_reconciled"
        : customerReplies === 0
          ? "no_replies"
          : "ok";

    return {
      sourceKey: job.sourceKey,
      jobId: job.jobId,
      label: job.originalLabelName ?? job.labelName,
      template: job.templateName,
      operatorName: job.operatorName,
      inboxName: job.inboxName,
      status: job.status,
      statusBucket: job.statusBucket,
      createdAt: job.createdAtApp,
      reconciledAt: job.reconciledAt,

      total: job.total,
      sent: job.sent,
      failed: job.failed,
      skipped: job.skipped,
      deliveryFailures: job.deliveryFailuresCount,

      matchedRecipients: matched,
      customerReplies,
      replyRate: job.sent > 0 ? customerReplies / job.sent : 0,
      teamReplied,
      avgTeamResponseSeconds: average(resp),
      unassigned,
      unmatched,

      agents,
      dataState,
    };
  });

  const sent = rows.reduce((s, r) => s + r.sent, 0);
  const customerReplies = rows.reduce((s, r) => s + r.customerReplies, 0);
  const lastReconciled = jobs
    .map((j) => j.reconciledAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return {
    rows,
    totals: {
      sent,
      failed: rows.reduce((s, r) => s + r.failed, 0),
      customerReplies,
      replyRate: sent > 0 ? customerReplies / sent : 0,
      teamReplied: rows.reduce((s, r) => s + r.teamReplied, 0),
      unmatched: rows.reduce((s, r) => s + r.unmatched, 0),
      repliesInPeriod,
    },
    meta: {
      lastCampaignSyncAt: lastSync?.startedAt ?? null,
      lastReconciledAt: lastReconciled,
      synced: jobs.length > 0 || (await prisma.campaignJob.count()) > 0,
    },
  };
}

/** Per-source rollup for the overview — source read from the job, never a marker. */
export async function getCampaignPerformanceBySource(f: ReportFilters) {
  const selected = f.campaignSource?.length ? f.campaignSource : ["sales", "operations"];
  const sources = (["sales", "operations"] as const).filter((s) => selected.includes(s));

  const out: { source: string; sent: number; failed: number; replies: number; replyRate: number }[] = [];

  for (const source of sources) {
    const jobs = await prisma.campaignJob.findMany({
      where: { sourceKey: source, type: "send", createdAtApp: { gte: f.from, lte: f.to } },
      select: { id: true, sent: true, failed: true },
      take: 2000,
    });

    const sent = jobs.reduce((s, j) => s + j.sent, 0);
    const failed = jobs.reduce((s, j) => s + j.failed, 0);

    const replies = jobs.length
      ? await prisma.campaignReply.findMany({
          where: { campaignJobId: { in: jobs.map((j) => j.id) }, replyAt: { lte: f.to } },
          select: { campaignJobId: true, conversationCwId: true },
          take: 100000,
        })
      : [];

    // Distinct per (job, conversation) — the same contact in two campaigns counts twice.
    const distinct = new Set(replies.map((r) => `${r.campaignJobId}:${r.conversationCwId}`)).size;

    out.push({ source, sent, failed, replies: distinct, replyRate: sent > 0 ? distinct / sent : 0 });
  }

  return out;
}

export async function getCampaignDetail(sourceKey: string, jobId: string) {
  const job = await prisma.campaignJob.findUnique({ where: { sourceKey_jobId: { sourceKey, jobId } } });
  if (!job) return null;

  const [recipients, replies] = await Promise.all([
    prisma.campaignRecipient.findMany({ where: { campaignJobId: job.id }, take: 5000 }),
    // Joined by job — not by label, which would drag in other campaigns.
    prisma.campaignReply.findMany({ where: { campaignJobId: job.id }, take: 5000 }),
  ]);

  return { job, recipients, replies };
}
