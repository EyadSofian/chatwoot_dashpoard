import { prisma } from "@/lib/db";
import { average, median } from "@/lib/format";
import { conversationWhere, type ReportFilters } from "./filters";
import { getCampaignPerformanceBySource } from "./campaigns";

function dayKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export interface OverviewResult {
  kpis: {
    totalConversations: number;
    openNow: number;
    needsReply: number;
    avgResponseSeconds: number | null;
    medianResponseSeconds: number | null;
    avgResolutionSeconds: number | null;
    slaBreaches: number;
    campaignsSent: number;
    campaignReplies: number;
  };
  dailyTrend: { date: string; count: number; resolved: number }[];
  responseByDepartment: { department: string; avgResponseSeconds: number | null; count: number }[];
  agentLoad: { agentId: number | null; name: string; open: number; needsReply: number; avgResponseSeconds: number | null }[];
  lateConversations: {
    chatwootId: number;
    contactName: string | null;
    assigneeName: string | null;
    department: string | null;
    waitingSeconds: number | null;
    status: string | null;
  }[];
  campaignPerformance: { source: string; sent: number; failed: number; replies: number; replyRate: number }[];
}

export async function getOverview(f: ReportFilters, tz = "Africa/Cairo"): Promise<OverviewResult> {
  const where = conversationWhere(f);

  const rows = await prisma.conversation.findMany({
    where,
    select: {
      chatwootId: true,
      createdAtCw: true,
      status: true,
      needsReply: true,
      department: true,
      responseSeconds: true,
      conversationDurationSeconds: true,
      slaFirstResponseBreached: true,
      assigneeCwId: true,
      assigneeName: true,
      assignedAt: true,
      firstHumanReplyAt: true,
      contactName: true,
    },
    take: 30000,
  });

  const now = Date.now();
  const responseValues = rows.map((r) => r.responseSeconds).filter((v): v is number => v !== null);
  const resolutionValues = rows.map((r) => r.conversationDurationSeconds).filter((v): v is number => v !== null);

  // Daily trend
  const dayMap = new Map<string, { count: number; resolved: number }>();
  for (const r of rows) {
    if (!r.createdAtCw) continue;
    const key = dayKey(r.createdAtCw, tz);
    const entry = dayMap.get(key) ?? { count: 0, resolved: 0 };
    entry.count++;
    if (r.status === "resolved") entry.resolved++;
    dayMap.set(key, entry);
  }
  const dailyTrend = [...dayMap.entries()]
    .map(([date, v]) => ({ date, count: v.count, resolved: v.resolved }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Response by department
  const deptMap = new Map<string, number[]>();
  for (const r of rows) {
    const dep = r.department ?? "unknown";
    if (r.responseSeconds !== null) {
      const arr = deptMap.get(dep) ?? [];
      arr.push(r.responseSeconds);
      deptMap.set(dep, arr);
    } else if (!deptMap.has(dep)) {
      deptMap.set(dep, []);
    }
  }
  const responseByDepartment = [...deptMap.entries()].map(([department, vals]) => ({
    department,
    avgResponseSeconds: average(vals),
    count: vals.length,
  }));

  // Agent load (open + needs reply)
  const agentMap = new Map<number, { name: string; open: number; needsReply: number; resp: number[] }>();
  for (const r of rows) {
    if (r.assigneeCwId === null) continue;
    const a = agentMap.get(r.assigneeCwId) ?? { name: r.assigneeName ?? `#${r.assigneeCwId}`, open: 0, needsReply: 0, resp: [] };
    if (r.status === "open") a.open++;
    if (r.needsReply) a.needsReply++;
    if (r.responseSeconds !== null) a.resp.push(r.responseSeconds);
    agentMap.set(r.assigneeCwId, a);
  }
  const agentLoad = [...agentMap.entries()]
    .map(([agentId, v]) => ({ agentId, name: v.name, open: v.open, needsReply: v.needsReply, avgResponseSeconds: average(v.resp) }))
    .sort((a, b) => b.open - a.open)
    .slice(0, 10);

  // Late conversations (open, needs reply, longest waiting since assignment/creation)
  const lateConversations = rows
    .filter((r) => r.status !== "resolved" && r.needsReply)
    .map((r) => {
      const base = r.assignedAt ?? r.createdAtCw;
      return {
        chatwootId: r.chatwootId,
        contactName: r.contactName,
        assigneeName: r.assigneeName,
        department: r.department,
        waitingSeconds: base ? Math.round((now - base.getTime()) / 1000) : null,
        status: r.status,
      };
    })
    .sort((a, b) => (b.waitingSeconds ?? 0) - (a.waitingSeconds ?? 0))
    .slice(0, 10);

  // Campaign performance
  const campaignPerformance = await getCampaignPerformance(f);

  return {
    kpis: {
      totalConversations: rows.length,
      openNow: rows.filter((r) => r.status === "open").length,
      needsReply: rows.filter((r) => r.needsReply).length,
      avgResponseSeconds: average(responseValues),
      medianResponseSeconds: median(responseValues),
      avgResolutionSeconds: average(resolutionValues),
      slaBreaches: rows.filter((r) => r.slaFirstResponseBreached).length,
      campaignsSent: campaignPerformance.reduce((s, c) => s + c.sent, 0),
      campaignReplies: campaignPerformance.reduce((s, c) => s + c.replies, 0),
    },
    dailyTrend,
    responseByDepartment,
    agentLoad,
    lateConversations,
    campaignPerformance,
  };
}

async function getCampaignPerformance(f: ReportFilters): Promise<OverviewResult["campaignPerformance"]> {
  // Source comes from CampaignJob.sourceKey. It used to be read off the
  // `api_campaign_reply_team_id` custom attribute, which the uploader only writes
  // when reply auto-assignment is configured — so both sources reported 0 replies
  // whenever it was not. See reporting/campaigns.ts.
  return getCampaignPerformanceBySource(f);
}
