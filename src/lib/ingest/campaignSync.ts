import { prisma } from "@/lib/db";
import { toDate } from "@/lib/time";
import {
  fetchJobs,
  fetchJobDetail,
  getCampaignSources,
  type CampaignJobSummary,
} from "@/lib/campaigns/client";
import { bucketForStatus } from "@/lib/campaigns/types";

export interface CampaignSyncStats {
  syncRunId: string;
  sources: number;
  jobs: number;
  recipients: number;
  errors: string[];
}

const DETAIL_JOB_LIMIT = 60; // cap detail (sentTrack/failedRecords) fetches per run

/** Import campaign jobs (and recipient rows) from both campaign uploader apps. */
export async function runCampaignSync(opts: { limit?: number; detail?: boolean } = {}): Promise<CampaignSyncStats> {
  const limit = Math.max(1, Math.min(opts.limit ?? 200, 200));
  const withDetail = opts.detail !== false;
  const sources = getCampaignSources();
  const errors: string[] = [];

  const run = await prisma.syncRun.create({
    data: { type: "campaign_sync", status: "running", params: { limit, detail: withDetail, sources: sources.map((s) => s.key) } },
  });

  const inboxes = await prisma.inbox.findMany({ select: { id: true, name: true } });
  const inboxName = new Map<number, string>();
  for (const i of inboxes) if (i.name) inboxName.set(i.id, i.name);

  let jobCount = 0;
  let recipientCount = 0;

  try {
    for (const source of sources) {
      const src = await prisma.campaignSource.upsert({
        where: { key: source.key },
        create: { key: source.key, name: source.name, baseUrl: source.baseUrl },
        update: { name: source.name, baseUrl: source.baseUrl },
      });

      let jobs: CampaignJobSummary[] = [];
      try {
        jobs = await fetchJobs(source.baseUrl, limit);
      } catch (error) {
        errors.push(`${source.key}: ${(error as Error).message}`);
        continue;
      }

      let detailFetched = 0;
      for (const job of jobs) {
        const inboxCwId = job.settings?.inboxId != null && job.settings.inboxId !== "" ? Number(job.settings.inboxId) : null;
        const counters = job.counters ?? {};
        const saved = await prisma.campaignJob.upsert({
          where: { sourceKey_jobId: { sourceKey: source.key, jobId: job.id } },
          create: mapJob(src.id, source.key, job, inboxCwId, inboxName),
          update: mapJob(src.id, source.key, job, inboxCwId, inboxName),
          select: { id: true },
        });
        jobCount++;

        // Recipient-level correlation from the full job detail.
        if (withDetail && job.type === "send" && detailFetched < DETAIL_JOB_LIMIT) {
          detailFetched++;
          const detail = await fetchJobDetail(source.baseUrl, job.id);
          if (detail) {
            const rows = buildRecipients(saved.id, source.key, job.id, detail);
            for (const row of rows) {
              await prisma.campaignRecipient
                .upsert({
                  where: { campaignJobId_phone: { campaignJobId: saved.id, phone: row.phone } },
                  create: row,
                  update: {
                    name: row.name,
                    status: row.status,
                    conversationCwId: row.conversationCwId,
                    messageCwId: row.messageCwId,
                    errorCode: row.errorCode,
                    errorDescription: row.errorDescription,
                  },
                })
                .then(() => recipientCount++)
                .catch(() => {});
            }
          }
          void counters;
        }
      }
    }

    const stats: CampaignSyncStats = {
      syncRunId: String(run.id),
      sources: sources.length,
      jobs: jobCount,
      recipients: recipientCount,
      errors,
    };
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: errors.length ? "partial" : "success", finishedAt: new Date(), stats: stats as unknown as object },
    });
    return stats;
  } catch (error) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "error", finishedAt: new Date(), error: (error as Error).message?.slice(0, 500) },
    });
    throw error;
  }
}

function mapJob(
  sourceId: number,
  sourceKey: string,
  job: CampaignJobSummary,
  inboxCwId: number | null,
  inboxName: Map<number, string>,
) {
  const counters = job.counters ?? {};
  return {
    sourceId,
    sourceKey,
    jobId: job.id,
    type: job.type ?? null,
    status: job.status ?? null,
    statusBucket: bucketForStatus(job.status, job.active),
    operatorName: job.operatorName ?? job.settings?.operatorName ?? null,
    queueLabel: job.queueLabel ?? null,
    labelName: job.settings?.labelName ?? null,
    originalLabelName: job.settings?.originalLabelName ?? null,
    templateName: job.settings?.templateName ?? null,
    inboxCwId,
    inboxName: inboxCwId != null ? inboxName.get(inboxCwId) ?? null : null,
    total: Number(job.total ?? 0),
    processed: Number(job.processed ?? 0),
    sent: Number(counters.sent ?? 0),
    failed: Number(counters.failed ?? 0) + Number(counters.errors ?? 0),
    skipped: Number(counters.skipped ?? 0),
    errors: Number(counters.errors ?? 0),
    failedRecordsCount: Number(job.failedRecordsCount ?? 0),
    sentTrackCount: Number(job.sentTrackCount ?? 0),
    deliveryFailuresCount: Number(job.deliveryFailuresCount ?? 0),
    createdAtApp: toDate(job.createdAt),
    startedAt: toDate(job.startedAt),
    finishedAt: toDate(job.finishedAt),
    active: Boolean(job.active),
    lastError: job.lastError ?? null,
    raw: job as object,
  };
}

interface RecipientRow {
  campaignJobId: bigint;
  sourceKey: string;
  jobId: string;
  phone: string;
  name: string | null;
  status: string;
  conversationCwId: number | null;
  messageCwId: number | null;
  errorCode: string | null;
  errorDescription: string | null;
}

function buildRecipients(
  campaignJobId: bigint,
  sourceKey: string,
  jobId: string,
  detail: { sentTrack?: Array<{ row?: Record<string, unknown>; convId?: number; msgId?: number }>; failedRecords?: Array<Record<string, unknown>> },
): RecipientRow[] {
  const rows = new Map<string, RecipientRow>();

  for (const sent of detail.sentTrack ?? []) {
    const phone = String(sent.row?.phone_number ?? "").trim();
    if (!phone) continue;
    rows.set(phone, {
      campaignJobId,
      sourceKey,
      jobId,
      phone,
      name: (sent.row?.name as string) ?? null,
      status: "sent",
      conversationCwId: typeof sent.convId === "number" ? sent.convId : null,
      messageCwId: typeof sent.msgId === "number" ? sent.msgId : null,
      errorCode: null,
      errorDescription: null,
    });
  }

  for (const failed of detail.failedRecords ?? []) {
    const phone = String(failed.phone ?? "").trim();
    if (!phone || rows.has(phone)) continue;
    rows.set(phone, {
      campaignJobId,
      sourceKey,
      jobId,
      phone,
      name: (failed.name as string) ?? null,
      status: "failed",
      conversationCwId: null,
      messageCwId: null,
      errorCode: (failed.error_code as string) ?? null,
      errorDescription: (failed.error_description as string) ?? null,
    });
  }

  return [...rows.values()];
}
