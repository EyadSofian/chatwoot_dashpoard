import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
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
  });

  const jobIds = jobs.map((j) => j.id);

  const [replyAggregates, recipientStates, lastSync, repliesInPeriod] = await Promise.all([
    jobIds.length
      ? prisma.$queryRaw<CampaignReplyAggregate[]>(Prisma.sql`
          SELECT
            r."campaignJobId",
            COUNT(DISTINCT r."conversationCwId")::bigint AS "customerReplies",
            COUNT(*) FILTER (WHERE r."firstAgentReplyAt" IS NOT NULL)::bigint AS "teamReplied",
            AVG(r."responseSeconds")::double precision AS "avgTeamResponseSeconds",
            COUNT(*) FILTER (WHERE r."assigned" = FALSE)::bigint AS "unassigned",
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT r."assigneeName"), NULL) AS "agents"
          FROM "campaign_replies" r
          WHERE r."campaignJobId" IN (${Prisma.join(jobIds)}) AND r."replyAt" <= ${f.to}
          GROUP BY r."campaignJobId"
        `)
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

  const repliesByJob = new Map(replyAggregates.map((row) => [String(row.campaignJobId), row]));

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
    const reply = repliesByJob.get(key);
    const customerReplies = asNumber(reply?.customerReplies);
    const teamReplied = asNumber(reply?.teamReplied);
    const unassigned = asNumber(reply?.unassigned);
    const agents = reply?.agents ?? [];

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
      avgTeamResponseSeconds: nullableNumber(reply?.avgTeamResponseSeconds),
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

  const rows = await Promise.all(
    sources.map(async (source) => {
      const [jobs, replyRows] = await Promise.all([
        prisma.campaignJob.aggregate({
          where: { sourceKey: source, type: "send", createdAtApp: { gte: f.from, lte: f.to } },
          _sum: { sent: true, failed: true },
        }),
        prisma.$queryRaw<Array<{ replies: bigint | number | string }>>(Prisma.sql`
          SELECT COUNT(DISTINCT (r."campaignJobId", r."conversationCwId"))::bigint AS "replies"
          FROM "campaign_replies" r
          INNER JOIN "campaign_jobs" j ON j."id" = r."campaignJobId"
          WHERE j."sourceKey" = ${source}
            AND j."type" = 'send'
            AND j."createdAtApp" >= ${f.from}
            AND j."createdAtApp" <= ${f.to}
            AND r."replyAt" <= ${f.to}
        `),
      ]);
      const sent = jobs._sum.sent ?? 0;
      const failed = jobs._sum.failed ?? 0;
      const replies = asNumber(replyRows[0]?.replies);
      return { source, sent, failed, replies, replyRate: sent > 0 ? replies / sent : 0 };
    }),
  );
  out.push(...rows);

  return out;
}

export async function getCampaignDetail(
  sourceKey: string,
  jobId: string,
  recipientPage = 1,
  replyPage = 1,
  pageSize = 100,
) {
  const job = await prisma.campaignJob.findUnique({ where: { sourceKey_jobId: { sourceKey, jobId } } });
  if (!job) return null;

  const size = Math.min(Math.max(pageSize, 1), 200);
  const recipientsPage = Math.max(recipientPage, 1);
  const repliesPage = Math.max(replyPage, 1);
  const [recipientTotal, recipientRows, replyTotal, replyRows] = await Promise.all([
    prisma.campaignRecipient.count({ where: { campaignJobId: job.id } }),
    prisma.campaignRecipient.findMany({
      where: { campaignJobId: job.id },
      orderBy: { id: "asc" },
      skip: (recipientsPage - 1) * size,
      take: size,
      select: {
        id: true,
        phone: true,
        name: true,
        status: true,
        conversationCwId: true,
        errorDescription: true,
      },
    }),
    prisma.campaignReply.count({ where: { campaignJobId: job.id } }),
    // Joined by job — not by label, which would drag in other campaigns.
    prisma.campaignReply.findMany({
      where: { campaignJobId: job.id },
      orderBy: { id: "asc" },
      skip: (repliesPage - 1) * size,
      take: size,
      select: {
        conversationCwId: true,
        assigned: true,
        assigneeName: true,
        responseSeconds: true,
      },
    }),
  ]);

  return {
    job: { ...job, id: String(job.id) },
    recipients: {
      rows: recipientRows.map((row) => ({ ...row, id: String(row.id) })),
      total: recipientTotal,
      page: recipientsPage,
      pages: Math.ceil(recipientTotal / size),
    },
    replies: {
      rows: replyRows,
      total: replyTotal,
      page: repliesPage,
      pages: Math.ceil(replyTotal / size),
    },
  };
}

interface CampaignReplyAggregate {
  campaignJobId: bigint;
  customerReplies: bigint | number | string;
  teamReplied: bigint | number | string;
  avgTeamResponseSeconds: number | string | null;
  unassigned: bigint | number | string;
  agents: string[];
}

function asNumber(value: bigint | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: bigint | number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
