import { env } from "@/env";
import type { CampaignSourceKey } from "./types";

export interface CampaignJobSummary {
  id: string;
  type?: string;
  status?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  total?: number;
  processed?: number;
  operatorName?: string;
  queueKey?: string;
  queueLabel?: string;
  lastError?: string;
  counters?: { new?: number; updated?: number; failed?: number; sent?: number; skipped?: number; errors?: number };
  settings?: {
    labelName?: string;
    originalLabelName?: string;
    templateName?: string;
    inboxId?: string | number;
    operatorName?: string;
  };
  sentTrackCount?: number;
  failedRecordsCount?: number;
  deliveryFailuresCount?: number;
  deliveryCheck?: { checked?: number; confirmed?: number; failed?: number };
}

export interface CampaignJobDetail extends CampaignJobSummary {
  sentTrack?: Array<{ row?: Record<string, unknown>; convId?: number; msgId?: number }>;
  failedRecords?: Array<Record<string, unknown>>;
  deliveryFailures?: Array<Record<string, unknown>>;
}

export interface CampaignSourceConfig {
  key: CampaignSourceKey;
  name: string;
  baseUrl: string;
}

/** Configured campaign sources from env (only those with a URL). */
export function getCampaignSources(): CampaignSourceConfig[] {
  const sources: CampaignSourceConfig[] = [];
  const sales = env.campaignSalesUrl();
  const ops = env.campaignOperationsUrl();
  if (sales) sources.push({ key: "sales", name: "Sales Campaign App", baseUrl: sales });
  if (ops) sources.push({ key: "operations", name: "Operations Campaign App", baseUrl: ops });
  return sources;
}

function authHeaders(): Record<string, string> {
  const secret = env.campaignAppsApiSecret();
  return secret ? { "x-webhook-secret": secret } : {};
}

async function appFetch(url: string, timeoutMs = 15000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: authHeaders(), signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** GET /api/jobs?limit=N — returns the summarized job list. */
export async function fetchJobs(baseUrl: string, limit = 200): Promise<CampaignJobSummary[]> {
  const data = (await appFetch(`${baseUrl}/api/jobs?limit=${Math.max(1, Math.min(limit, 200))}`)) as {
    jobs?: CampaignJobSummary[];
  };
  return Array.isArray(data?.jobs) ? data.jobs : [];
}

/** GET /api/jobs/:id — full detail incl. sentTrack + failedRecords. */
export async function fetchJobDetail(baseUrl: string, jobId: string): Promise<CampaignJobDetail | null> {
  try {
    const data = (await appFetch(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}`)) as {
      job?: CampaignJobDetail;
    };
    return data?.job ?? null;
  } catch {
    return null;
  }
}

/** Probe a campaign app for the Settings screen. */
export async function probeCampaignApp(baseUrl: string): Promise<{ ok: boolean; jobs: number; error?: string }> {
  try {
    const jobs = await fetchJobs(baseUrl, 5);
    return { ok: true, jobs: jobs.length };
  } catch (error) {
    return { ok: false, jobs: 0, error: (error as Error).message };
  }
}
