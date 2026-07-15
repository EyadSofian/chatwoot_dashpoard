import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchLiveCountsByEntity, supportsLiveFilters } from "@/lib/chatwoot/liveCounts";
import { average, median, percentile } from "@/lib/format";
import { conversationWhere, type ReportFilters } from "./filters";
import { andSql, conversationSqlConditions } from "./sqlFilters";

/**
 * Agent metrics, with the three things that used to be one number pulled apart.
 *
 * The old report called ONE number "Assigned": conversations whose CURRENT
 * assignee is this agent AND whose createdAtCw fell inside the date range. That
 * conflates three unrelated questions and answers none of them:
 *
 *   • "How much is on their plate right now?"  — a live-state question. It must
 *     not be filtered by a date range at all. This is what Chatwoot's own
 *     conversation list shows, and why Chatwoot said 11 while the dashboard said
 *     6: five of their eleven open conversations were simply created before the
 *     window.
 *   • "How much work landed on them during the period?" — an assignment question.
 *     It comes from AssignmentInterval.startedAt, not from conversation creation,
 *     and not from who happens to hold the conversation today.
 *   • "How many new conversations arrived during the period?" — an acquisition
 *     question, and the only one createdAtCw actually answers.
 *
 * Every field below states which of the three it is. Nothing is called
 * "conversations".
 */

/** Statuses that count as live work. `resolved` is finished; it is not workload. */
export const ACTIVE_STATUSES = ["open", "pending", "snoozed"] as const;

export interface AgentRow {
  agentId: number;
  name: string;
  email: string | null;
  availability: string | null;

  // ── Live state. NOT filtered by the date range. ──
  currentOpen: number;
  currentPending: number;
  currentSnoozed: number;
  /** pending + snoozed from the same live Chatwoot count snapshot. */
  currentWaiting: number;
  /** open + pending + snoozed. Matches Chatwoot's current assignment view. */
  currentWorkload: number;
  /** Customer spoke last and no human has answered — right now, not in a window. */
  needsReplyNow: number;

  // ── Period activity ──
  /** Distinct conversations assigned to them during the period (AssignmentInterval). */
  assignedInPeriod: number;
  /** Every assignment record in the period. Re-assigning the same conversation
   *  twice counts twice here and once in `assignedInPeriod`. */
  assignmentEvents: number;
  /** Conversations CREATED in the period that are currently theirs (acquisition). */
  createdInPeriod: number;
  /** Conversations resolved in the period while assigned to them. We do not know
   *  who pressed resolve — Chatwoot does not give us the actor — so this is
   *  never claimed as "resolved BY the agent". */
  resolvedWhileAssigned: number;
  /** Assignments in the period they actually answered. */
  firstResponsesInPeriod: number;

  // ── Response time, over assignments that started in the period ──
  avgResponseSeconds: number | null;
  medianResponseSeconds: number | null;
  p90ResponseSeconds: number | null;
  maxResponseSeconds: number | null;
  responseCount: number;

  /** SLA breaches among the conversations assigned to them in the period. */
  slaBreaches: number;

  /** Any live work or any period activity. */
  hasActivity: boolean;
}

export interface AgentSummary {
  totalAgents: number;
  activeAgents: number;
  currentWorkload: number;
  needsReplyNow: number;
  assignedInPeriod: number;
  avgResponseSeconds: number | null;
  p90ResponseSeconds: number | null;
  slaBreaches: number;
}

export interface AgentLeaderboard {
  rows: AgentRow[];
  summary: AgentSummary;
  live?: {
    source: "chatwoot" | "database";
    exact: boolean;
    snapshotAt: string | null;
    databaseTotal: number;
    chatwootTotal: number | null;
    difference: number | null;
    reason: "live" | "unsupported_filters" | "chatwoot_unavailable";
  };
}

/* ── Structural inputs, so the merge stays pure and testable ────────────────── */

export interface AgentRecord {
  id: number;
  name: string | null;
  email: string | null;
  availability: string | null;
}

/** A live, currently-active conversation. No date filter was applied to it. */
export interface CurrentConversation {
  assigneeCwId: number | null;
  status: string | null;
  needsReply: boolean;
}

/** One assignment of one conversation to one agent, started inside the period. */
export interface AgentInterval {
  assigneeCwId: number;
  conversationCwId: number;
  responseSeconds: number | null;
  responded: boolean;
  /** The conversation's first-response SLA verdict. */
  slaBreached?: boolean;
}

/** A conversation created inside the period. */
export interface CreatedConversation {
  assigneeCwId: number | null;
}

/** A conversation resolved inside the period. */
export interface ResolvedConversation {
  assigneeCwId: number | null;
}

function emptyRow(agentId: number, info: Partial<AgentRecord> & { fallbackName?: string | null }): AgentRow {
  return {
    agentId,
    name: info.name || info.fallbackName || `#${agentId}`,
    email: info.email ?? null,
    availability: info.availability ?? null,
    currentOpen: 0,
    currentPending: 0,
    currentSnoozed: 0,
    currentWaiting: 0,
    currentWorkload: 0,
    needsReplyNow: 0,
    assignedInPeriod: 0,
    assignmentEvents: 0,
    createdInPeriod: 0,
    resolvedWhileAssigned: 0,
    firstResponsesInPeriod: 0,
    avgResponseSeconds: null,
    medianResponseSeconds: null,
    p90ResponseSeconds: null,
    maxResponseSeconds: null,
    responseCount: 0,
    slaBreaches: 0,
    hasActivity: false,
  };
}

/**
 * Merge each source onto the FULL agent roster — a left join, in memory. Every
 * agent appears whether or not they did anything; a quiet agent is a real answer.
 */
export function buildAgentLeaderboard(input: {
  agents: AgentRecord[];
  /** Live active conversations (no date filter). */
  current: CurrentConversation[];
  /** Assignment intervals started inside the period. */
  intervals: AgentInterval[];
  /** Conversations created inside the period. */
  created: CreatedConversation[];
  /** Conversations resolved inside the period. */
  resolved: ResolvedConversation[];
  activeOnly?: boolean;
}): AgentLeaderboard {
  const { agents, current, intervals, created, resolved, activeOnly = false } = input;

  const rows = new Map<number, AgentRow>();
  const responses = new Map<number, number[]>();
  /** agent → the distinct conversations assigned to them in the period. */
  const assignedConvs = new Map<number, Set<number>>();
  /** agent → conversations assigned in the period whose SLA is breached. */
  const breached = new Map<number, Set<number>>();

  const row = (id: number, fallbackName?: string | null): AgentRow => {
    let r = rows.get(id);
    if (!r) {
      r = emptyRow(id, { fallbackName });
      rows.set(id, r);
    }
    return r;
  };

  // 1. Seed the roster — this is what keeps a zero-activity agent visible.
  for (const a of agents) rows.set(a.id, emptyRow(a.id, a));

  // 2. Live workload. No date range touches this.
  for (const c of current) {
    if (c.assigneeCwId === null) continue;
    const r = row(c.assigneeCwId);
    if (c.status === "open") r.currentOpen++;
    else if (c.status === "pending") r.currentPending++;
    else if (c.status === "snoozed") r.currentSnoozed++;
    else continue; // resolved is not workload
    r.currentWorkload++;
    r.currentWaiting = r.currentPending + r.currentSnoozed;
    if (c.needsReply) r.needsReplyNow++;
  }

  // 3. Assignment activity in the period.
  for (const i of intervals) {
    const r = row(i.assigneeCwId);
    r.assignmentEvents++;

    const seen = assignedConvs.get(i.assigneeCwId) ?? new Set<number>();
    seen.add(i.conversationCwId);
    assignedConvs.set(i.assigneeCwId, seen);

    if (i.slaBreached) {
      const b = breached.get(i.assigneeCwId) ?? new Set<number>();
      b.add(i.conversationCwId);
      breached.set(i.assigneeCwId, b);
    }

    if (i.responded && i.responseSeconds !== null) {
      r.firstResponsesInPeriod++;
      const list = responses.get(i.assigneeCwId) ?? [];
      list.push(i.responseSeconds);
      responses.set(i.assigneeCwId, list);
    }
  }

  for (const [agentId, convs] of assignedConvs) rows.get(agentId)!.assignedInPeriod = convs.size;
  for (const [agentId, convs] of breached) rows.get(agentId)!.slaBreaches = convs.size;

  // 4. Acquisition — the only thing createdAtCw is allowed to answer.
  for (const c of created) {
    if (c.assigneeCwId === null) continue;
    row(c.assigneeCwId).createdInPeriod++;
  }

  // 5. Resolved in the period, while assigned to them.
  for (const c of resolved) {
    if (c.assigneeCwId === null) continue;
    row(c.assigneeCwId).resolvedWhileAssigned++;
  }

  // 6. Response-time distribution.
  for (const [agentId, list] of responses) {
    const r = rows.get(agentId)!;
    r.avgResponseSeconds = average(list);
    r.medianResponseSeconds = median(list);
    r.p90ResponseSeconds = percentile(list, 90);
    r.maxResponseSeconds = list.length ? Math.max(...list) : null;
    r.responseCount = list.length;
  }

  const all = [...rows.values()];
  for (const r of all) {
    r.hasActivity =
      r.currentWorkload > 0 || r.assignmentEvents > 0 || r.createdInPeriod > 0 || r.resolvedWhileAssigned > 0;
  }

  const pooled = [...responses.values()].flat();
  const summary: AgentSummary = {
    totalAgents: all.length,
    activeAgents: all.filter((r) => r.hasActivity).length,
    currentWorkload: all.reduce((n, r) => n + r.currentWorkload, 0),
    needsReplyNow: all.reduce((n, r) => n + r.needsReplyNow, 0),
    assignedInPeriod: all.reduce((n, r) => n + r.assignedInPeriod, 0),
    avgResponseSeconds: average(pooled),
    p90ResponseSeconds: percentile(pooled, 90),
    slaBreaches: all.reduce((n, r) => n + r.slaBreaches, 0),
  };

  const visible = activeOnly ? all.filter((r) => r.hasActivity) : all;

  visible.sort((a, b) => {
    if (a.hasActivity !== b.hasActivity) return a.hasActivity ? -1 : 1;
    if (b.currentWorkload !== a.currentWorkload) return b.currentWorkload - a.currentWorkload;
    if (b.assignedInPeriod !== a.assignedInPeriod) return b.assignedInPeriod - a.assignedInPeriod;
    return a.name.localeCompare(b.name, "ar");
  });

  return { rows: visible, summary };
}

export async function getAgentLeaderboard(f: ReportFilters): Promise<AgentLeaderboard> {
  const activeStatuses = ACTIVE_STATUSES.filter((status) => !f.status?.length || f.status.includes(status));
  const agentWhere = f.agentId?.length ? { id: { in: f.agentId } } : {};
  const assigneeScope = f.agentId?.length ? { in: f.agentId } : { not: null as null };
  const liveWhere = conversationWhere(f, { ignoreDate: true });
  const periodWhere = conversationWhere(f);

  const intervalConditions = [
    Prisma.sql`i."startedAt" >= ${f.from}`,
    Prisma.sql`i."startedAt" <= ${f.to}`,
    ...(f.agentId?.length ? [Prisma.sql`i."assigneeCwId" IN (${Prisma.join(f.agentId)})`] : []),
    ...(f.teamId?.length
      ? [Prisma.sql`COALESCE(i."teamCwId", c."teamCwId") IN (${Prisma.join(f.teamId)})`]
      : []),
    ...conversationSqlConditions(f, {
      alias: "c",
      ignoreDate: true,
      ignoreAgent: true,
      ignoreTeam: true,
    }),
  ];

  const [agents, current, currentNeedsReply, created, resolved, intervalRows] = await Promise.all([
    prisma.agent.findMany({
      where: agentWhere,
      select: { id: true, name: true, email: true, availability: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    activeStatuses.length
      ? prisma.conversation.groupBy({
          by: ["assigneeCwId", "status"],
          where: {
            ...liveWhere,
            assigneeCwId: assigneeScope,
            status: { in: [...activeStatuses] },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    activeStatuses.length
      ? prisma.conversation.groupBy({
          by: ["assigneeCwId"],
          where: {
            ...liveWhere,
            assigneeCwId: assigneeScope,
            status: { in: [...activeStatuses] },
            needsReply: true,
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.conversation.groupBy({
      by: ["assigneeCwId"],
      where: { ...periodWhere, assigneeCwId: assigneeScope },
      _count: { _all: true },
    }),
    prisma.conversation.groupBy({
      by: ["assigneeCwId"],
      where: {
        ...liveWhere,
        resolvedAt: { gte: f.from, lte: f.to },
        assigneeCwId: assigneeScope,
      },
      _count: { _all: true },
    }),
    prisma.$queryRaw<IntervalAggregate[]>(Prisma.sql`
      SELECT
        CASE WHEN GROUPING(i."assigneeCwId") = 1 THEN NULL ELSE i."assigneeCwId" END AS "agentId",
        GROUPING(i."assigneeCwId")::int AS "isSummary",
        COUNT(*)::bigint AS "assignmentEvents",
        COUNT(DISTINCT i."conversationCwId")::bigint AS "assignedInPeriod",
        COUNT(*) FILTER (
          WHERE i."responded" = TRUE AND i."responseSeconds" IS NOT NULL
        )::bigint AS "responseCount",
        AVG(i."responseSeconds") FILTER (
          WHERE i."responded" = TRUE AND i."responseSeconds" IS NOT NULL
        )::double precision AS "avgResponseSeconds",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY i."responseSeconds") FILTER (
          WHERE i."responded" = TRUE AND i."responseSeconds" IS NOT NULL
        )::double precision AS "medianResponseSeconds",
        PERCENTILE_DISC(0.9) WITHIN GROUP (ORDER BY i."responseSeconds") FILTER (
          WHERE i."responded" = TRUE AND i."responseSeconds" IS NOT NULL
        )::double precision AS "p90ResponseSeconds",
        MAX(i."responseSeconds") FILTER (
          WHERE i."responded" = TRUE AND i."responseSeconds" IS NOT NULL
        )::double precision AS "maxResponseSeconds",
        COUNT(DISTINCT CASE
          WHEN c."slaFirstResponseBreached" = TRUE THEN i."conversationCwId"
        END)::bigint AS "slaBreaches"
      FROM "assignment_intervals" i
      INNER JOIN "conversations" c ON c."chatwootId" = i."conversationCwId"
      ${andSql(intervalConditions)}
      GROUP BY GROUPING SETS ((i."assigneeCwId"), ())
    `),
  ]);

  const rows = new Map<number, AgentRow>();
  const ensure = (agentId: number) => {
    let row = rows.get(agentId);
    if (!row) {
      row = emptyRow(agentId, {});
      rows.set(agentId, row);
    }
    return row;
  };

  for (const agent of agents) rows.set(agent.id, emptyRow(agent.id, agent));

  for (const group of current) {
    if (group.assigneeCwId === null) continue;
    const row = ensure(group.assigneeCwId);
    const count = group._count._all;
    if (group.status === "open") row.currentOpen = count;
    if (group.status === "pending") row.currentPending = count;
    if (group.status === "snoozed") row.currentSnoozed = count;
  }
  for (const row of rows.values()) {
    row.currentWaiting = row.currentPending + row.currentSnoozed;
    row.currentWorkload = row.currentOpen + row.currentWaiting;
  }
  for (const group of currentNeedsReply) {
    if (group.assigneeCwId !== null) ensure(group.assigneeCwId).needsReplyNow = group._count._all;
  }
  for (const group of created) {
    if (group.assigneeCwId !== null) ensure(group.assigneeCwId).createdInPeriod = group._count._all;
  }
  for (const group of resolved) {
    if (group.assigneeCwId !== null) ensure(group.assigneeCwId).resolvedWhileAssigned = group._count._all;
  }

  let intervalSummary: IntervalAggregate | undefined;
  for (const aggregate of intervalRows) {
    if (aggregate.isSummary === 1) {
      intervalSummary = aggregate;
      continue;
    }
    if (aggregate.agentId === null) continue;
    const row = ensure(aggregate.agentId);
    row.assignmentEvents = asNumber(aggregate.assignmentEvents);
    row.assignedInPeriod = asNumber(aggregate.assignedInPeriod);
    row.firstResponsesInPeriod = asNumber(aggregate.responseCount);
    row.responseCount = asNumber(aggregate.responseCount);
    row.avgResponseSeconds = nullableNumber(aggregate.avgResponseSeconds);
    row.medianResponseSeconds = nullableNumber(aggregate.medianResponseSeconds);
    row.p90ResponseSeconds = nullableNumber(aggregate.p90ResponseSeconds);
    row.maxResponseSeconds = nullableNumber(aggregate.maxResponseSeconds);
    row.slaBreaches = asNumber(aggregate.slaBreaches);
  }

  const databaseTotal = [...rows.values()].reduce((sum, row) => sum + row.currentWorkload, 0);
  const liveSupported = supportsLiveFilters(f);
  const liveCounts = liveSupported
    ? await fetchLiveCountsByEntity("agent", [...rows.keys()], f).catch(() => null)
    : null;

  if (liveCounts) {
    for (const count of liveCounts.counts) {
      const row = ensure(count.id);
      row.currentOpen = count.open;
      row.currentWaiting = Math.max(0, count.active - count.open);
      row.currentWorkload = count.active;
    }
  }

  const allRows = [...rows.values()];
  for (const row of allRows) {
    row.hasActivity =
      row.currentWorkload > 0 ||
      row.assignmentEvents > 0 ||
      row.createdInPeriod > 0 ||
      row.resolvedWhileAssigned > 0;
  }

  const summary: AgentSummary = {
    totalAgents: allRows.length,
    activeAgents: allRows.filter((row) => row.hasActivity).length,
    currentWorkload: allRows.reduce((sum, row) => sum + row.currentWorkload, 0),
    needsReplyNow: allRows.reduce((sum, row) => sum + row.needsReplyNow, 0),
    assignedInPeriod: allRows.reduce((sum, row) => sum + row.assignedInPeriod, 0),
    avgResponseSeconds: nullableNumber(intervalSummary?.avgResponseSeconds),
    p90ResponseSeconds: nullableNumber(intervalSummary?.p90ResponseSeconds),
    slaBreaches: allRows.reduce((sum, row) => sum + row.slaBreaches, 0),
  };

  const visible = f.activeOnly ? allRows.filter((row) => row.hasActivity) : allRows;
  visible.sort((a, b) => {
    if (a.hasActivity !== b.hasActivity) return a.hasActivity ? -1 : 1;
    if (b.currentWorkload !== a.currentWorkload) return b.currentWorkload - a.currentWorkload;
    if (b.assignedInPeriod !== a.assignedInPeriod) return b.assignedInPeriod - a.assignedInPeriod;
    return a.name.localeCompare(b.name, "en");
  });

  const chatwootTotal = liveCounts ? liveCounts.counts.reduce((sum, count) => sum + count.active, 0) : null;
  return {
    rows: visible,
    summary,
    live: {
      source: liveCounts ? "chatwoot" : "database",
      exact: Boolean(liveCounts),
      snapshotAt: liveCounts?.snapshotAt ?? null,
      databaseTotal,
      chatwootTotal,
      difference: chatwootTotal === null ? null : chatwootTotal - databaseTotal,
      reason: liveCounts ? "live" : liveSupported ? "chatwoot_unavailable" : "unsupported_filters",
    },
  };
}

interface IntervalAggregate {
  agentId: number | null;
  isSummary: number;
  assignmentEvents: bigint | number | string;
  assignedInPeriod: bigint | number | string;
  responseCount: bigint | number | string;
  avgResponseSeconds: number | string | null;
  medianResponseSeconds: number | string | null;
  p90ResponseSeconds: number | string | null;
  maxResponseSeconds: number | string | null;
  slaBreaches: bigint | number | string;
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

export async function getAgentDetail(agentId: number, f: ReportFilters, page = 1, pageSize = 50) {
  const size = Math.min(Math.max(pageSize, 1), 200);
  const currentPage = Math.max(page, 1);
  const where = { ...conversationWhere(f, { ignoreDate: true }), assigneeCwId: agentId };
  const [agent, board, total, rows] = await Promise.all([
    prisma.agent.findUnique({ where: { id: agentId } }),
    getAgentLeaderboard({ ...f, agentId: [agentId], activeOnly: false }),
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip: (currentPage - 1) * size,
      take: size,
      select: {
        chatwootId: true,
        contactName: true,
        contactPhone: true,
        status: true,
        department: true,
        inboxName: true,
        needsReply: true,
        responseSeconds: true,
        conversationDurationSeconds: true,
        campaignLabel: true,
        lastMessageAt: true,
        createdAtCw: true,
        slaFirstResponseBreached: true,
      },
    }),
  ]);

  const summary = board.rows.find((a) => a.agentId === agentId) ?? null;
  return {
    agent,
    summary,
    conversations: { rows, total, page: currentPage, pageSize: size, pages: Math.ceil(total / size) },
    live: board.live,
  };
}
