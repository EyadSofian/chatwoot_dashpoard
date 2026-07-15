import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchLiveAccountCount } from "@/lib/chatwoot/liveCounts";
import { conversationWhere, type ReportFilters } from "./filters";
import { getCampaignPerformanceBySource } from "./campaigns";
import { getAgentLeaderboard } from "./agents";
import { andSql, conversationSqlConditions } from "./sqlFilters";

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
  const sqlWhere = andSql(conversationSqlConditions(f, { alias: "c" }));
  const activeStatuses = ["open", "pending", "snoozed"].filter(
    (status) => !f.status?.length || f.status.includes(status),
  );
  const currentWhere = conversationWhere(f, { ignoreDate: true });

  const [summaryRows, dailyRows, departmentRows, lateRows, campaignPerformance, agentBoard, liveAccount, dbOpenNow, needsReply] =
    await Promise.all([
      prisma.$queryRaw<OverviewAggregate[]>(Prisma.sql`
        SELECT
          COUNT(*)::bigint AS "totalConversations",
          AVG(c."responseSeconds")::double precision AS "avgResponseSeconds",
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c."responseSeconds") FILTER (
            WHERE c."responseSeconds" IS NOT NULL
          )::double precision AS "medianResponseSeconds",
          AVG(c."conversationDurationSeconds")::double precision AS "avgResolutionSeconds",
          COUNT(*) FILTER (WHERE c."slaFirstResponseBreached" = TRUE)::bigint AS "slaBreaches"
        FROM "conversations" c
        ${sqlWhere}
      `),
      prisma.$queryRaw<DailyAggregate[]>(Prisma.sql`
        SELECT
          TO_CHAR(c."createdAtCw" AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS "date",
          COUNT(*)::bigint AS "count",
          COUNT(*) FILTER (WHERE c."status" = 'resolved')::bigint AS "resolved"
        FROM "conversations" c
        ${sqlWhere}
        GROUP BY 1
        ORDER BY 1
      `),
      prisma.$queryRaw<DepartmentAggregate[]>(Prisma.sql`
        SELECT
          COALESCE(c."department", 'unknown') AS "department",
          AVG(c."responseSeconds")::double precision AS "avgResponseSeconds",
          COUNT(c."responseSeconds")::bigint AS "count"
        FROM "conversations" c
        ${sqlWhere}
        GROUP BY COALESCE(c."department", 'unknown')
        ORDER BY COALESCE(c."department", 'unknown')
      `),
      prisma.conversation.findMany({
        where: { ...where, status: { not: "resolved" }, needsReply: true },
        orderBy: [{ assignedAt: "asc" }, { createdAtCw: "asc" }],
        take: 10,
        select: {
          chatwootId: true,
          contactName: true,
          assigneeName: true,
          department: true,
          assignedAt: true,
          createdAtCw: true,
          status: true,
        },
      }),
      getCampaignPerformance(f),
      getAgentLeaderboard({ ...f, activeOnly: true }),
      fetchLiveAccountCount(f).catch(() => null),
      prisma.conversation.count({ where: { ...currentWhere, status: "open" } }),
      activeStatuses.length
        ? prisma.conversation.count({
            where: { ...currentWhere, status: { in: activeStatuses }, needsReply: true },
          })
        : Promise.resolve(0),
    ]);

  const aggregate = summaryRows[0];
  const dailyTrend = dailyRows.map((row) => ({
    date: row.date,
    count: asNumber(row.count),
    resolved: asNumber(row.resolved),
  }));
  const responseByDepartment = departmentRows.map((row) => ({
    department: row.department,
    avgResponseSeconds: nullableNumber(row.avgResponseSeconds),
    count: asNumber(row.count),
  }));
  const agentLoad = agentBoard.rows.slice(0, 10).map((row) => ({
    agentId: row.agentId,
    name: row.name,
    open: row.currentOpen,
    needsReply: row.needsReplyNow,
    avgResponseSeconds: row.avgResponseSeconds,
  }));
  const now = Date.now();
  const lateConversations = lateRows.map((row) => {
    const base = row.assignedAt ?? row.createdAtCw;
    return {
      chatwootId: row.chatwootId,
      contactName: row.contactName,
      assigneeName: row.assigneeName,
      department: row.department,
      waitingSeconds: base ? Math.max(0, Math.round((now - base.getTime()) / 1000)) : null,
      status: row.status,
    };
  });

  return {
    kpis: {
      totalConversations: asNumber(aggregate?.totalConversations),
      openNow: liveAccount?.open ?? dbOpenNow,
      needsReply,
      avgResponseSeconds: nullableNumber(aggregate?.avgResponseSeconds),
      medianResponseSeconds: nullableNumber(aggregate?.medianResponseSeconds),
      avgResolutionSeconds: nullableNumber(aggregate?.avgResolutionSeconds),
      slaBreaches: asNumber(aggregate?.slaBreaches),
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

interface OverviewAggregate {
  totalConversations: bigint | number | string;
  avgResponseSeconds: number | string | null;
  medianResponseSeconds: number | string | null;
  avgResolutionSeconds: number | string | null;
  slaBreaches: bigint | number | string;
}

interface DailyAggregate {
  date: string;
  count: bigint | number | string;
  resolved: bigint | number | string;
}

interface DepartmentAggregate {
  department: string;
  avgResponseSeconds: number | string | null;
  count: bigint | number | string;
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

async function getCampaignPerformance(f: ReportFilters): Promise<OverviewResult["campaignPerformance"]> {
  // Source comes from CampaignJob.sourceKey. It used to be read off the
  // `api_campaign_reply_team_id` custom attribute, which the uploader only writes
  // when reply auto-assignment is configured — so both sources reported 0 replies
  // whenever it was not. See reporting/campaigns.ts.
  return getCampaignPerformanceBySource(f);
}
