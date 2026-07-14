import { prisma } from "@/lib/db";
import { average } from "@/lib/format";
import type { ReportFilters } from "./filters";

export interface CampaignRow {
  sourceKey: string;
  jobId: string;
  label: string | null;
  template: string | null;
  operatorName: string | null;
  inboxName: string | null;
  status: string | null;
  statusBucket: string | null;
  createdAt: Date | null;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  deliveryFailures: number;
  replies: number;
  replyRate: number;
  assignedReplies: number;
  unassignedReplies: number;
  avgReplyResponseSeconds: number | null;
  agents: string[];
}

interface ReplyAgg {
  count: number;
  assigned: number;
  resp: number[];
  agents: Set<string>;
}

export async function getCampaigns(f: ReportFilters): Promise<{ rows: CampaignRow[]; totals: { sent: number; failed: number; replies: number } }> {
  const sourceFilter = f.campaignSource ? { sourceKey: f.campaignSource } : {};

  const jobs = await prisma.campaignJob.findMany({
    where: { type: "send", createdAtApp: { gte: f.from, lte: f.to }, ...sourceFilter },
    orderBy: { createdAtApp: "desc" },
    take: 1000,
  });

  const replies = await prisma.campaignReply.findMany({
    where: { replyAt: { gte: f.from, lte: f.to }, ...(f.campaignSource ? { campaignSource: f.campaignSource } : {}) },
    select: { campaignLabel: true, campaignSource: true, assigned: true, responseSeconds: true, assigneeName: true },
    take: 50000,
  });

  const replyByLabel = new Map<string, ReplyAgg>();
  for (const r of replies) {
    const key = `${r.campaignSource ?? ""}:${r.campaignLabel}`;
    const agg = replyByLabel.get(key) ?? { count: 0, assigned: 0, resp: [], agents: new Set<string>() };
    agg.count++;
    if (r.assigned) agg.assigned++;
    if (r.responseSeconds !== null) agg.resp.push(r.responseSeconds);
    if (r.assigneeName) agg.agents.add(r.assigneeName);
    replyByLabel.set(key, agg);
  }

  const rows: CampaignRow[] = jobs.map((job) => {
    const key = `${job.sourceKey}:${job.labelName ?? ""}`;
    const keyNoSource = `:${job.labelName ?? ""}`;
    const agg = replyByLabel.get(key) ?? replyByLabel.get(keyNoSource);
    const replyCount = agg?.count ?? 0;
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
      total: job.total,
      sent: job.sent,
      failed: job.failed,
      skipped: job.skipped,
      deliveryFailures: job.deliveryFailuresCount,
      replies: replyCount,
      replyRate: job.sent > 0 ? replyCount / job.sent : 0,
      assignedReplies: agg?.assigned ?? 0,
      unassignedReplies: replyCount - (agg?.assigned ?? 0),
      avgReplyResponseSeconds: agg ? average(agg.resp) : null,
      agents: agg ? [...agg.agents] : [],
    };
  });

  return {
    rows,
    totals: {
      sent: rows.reduce((s, r) => s + r.sent, 0),
      failed: rows.reduce((s, r) => s + r.failed, 0),
      replies: rows.reduce((s, r) => s + r.replies, 0),
    },
  };
}

export async function getCampaignDetail(sourceKey: string, jobId: string) {
  const job = await prisma.campaignJob.findUnique({ where: { sourceKey_jobId: { sourceKey, jobId } } });
  if (!job) return null;
  const [recipients, replies] = await Promise.all([
    prisma.campaignRecipient.findMany({ where: { campaignJobId: job.id }, take: 5000 }),
    prisma.campaignReply.findMany({
      where: { campaignLabel: job.labelName ?? "__none__", ...(sourceKey ? { campaignSource: sourceKey } : {}) },
      take: 5000,
    }),
  ]);
  return { job, recipients, replies };
}
