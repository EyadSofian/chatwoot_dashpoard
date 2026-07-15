import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ChatwootClient, getPayload } from "@/lib/chatwoot/client";
import { fetchAllMessages } from "@/lib/chatwoot/fetchers";
import { assembleConversation } from "@/lib/metrics/conversation";
import { buildAssembleContext } from "@/lib/ingest/context";
import { persistConversation } from "@/lib/ingest/persist";
import { ACTIVE_STATUSES } from "@/lib/reporting/agents";
import { conversationWhere, type ReportFilters } from "@/lib/reporting/filters";
import type { CwConversation } from "@/lib/chatwoot/types";

/**
 * Accuracy audit: reconcile what Chatwoot says RIGHT NOW against what the
 * analytics database says, per agent, down to the conversation id.
 *
 * The point is not the totals. The point is that when Chatwoot shows 11 and the
 * dashboard shows 6, a manager can see the five ids and the reason for each.
 *
 * Read-only against Chatwoot. Nothing here writes to Chatwoot, ever.
 */

/** A live conversation as Chatwoot reports it now. */
export interface LiveConversation {
  chatwootId: number;
  status: string | null;
  assigneeCwId: number | null;
  assigneeName: string | null;
}

interface AuditIntervalAggregate {
  agentId: number;
  assignedInPeriod: bigint | number | string;
  assignmentEvents: bigint | number | string;
  responses: bigint | number | string;
}

function numberValue(value: bigint | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type MismatchReason =
  | "missing_in_dashboard" // Chatwoot has it; we have never ingested it
  | "different_assignee" // we have it, assigned to someone else
  | "different_status" // we have it, but not in an active status
  | "not_assigned_in_chatwoot"; // we say it is theirs; Chatwoot no longer does

export interface AgentAuditRow {
  agentId: number;
  name: string;

  // Live Chatwoot
  chatwootOpen: number;
  chatwootPending: number;
  chatwootSnoozed: number;
  chatwootActive: number;

  // Dashboard (PostgreSQL)
  dashboardOpen: number;
  dashboardPending: number;
  dashboardSnoozed: number;
  dashboardActive: number;

  /** dashboardActive − chatwootActive. Negative means we are under-counting. */
  difference: number;

  // Period activity (for context; not part of the mismatch)
  assignedInPeriod: number;
  assignmentEvents: number;
  firstResponsesInPeriod: number;
  createdInPeriod: number;
  resolvedInPeriod: number;
  needsReplyNow: number;

  missingInDashboard: number[];
  notAssignedInChatwoot: number[];
}

export interface AuditFreshness {
  /** When this Chatwoot snapshot was taken. */
  chatwootSnapshotAt: string;
  /** Newest ingest we have — the last time any conversation row was written. */
  lastIngestAt: string | null;
  /** Conversations scanned from Chatwoot. */
  scanned: number;
  /** Pages walked. Hitting the cap means the snapshot is incomplete. */
  pages: number;
  truncated: boolean;
  mismatchedAgents: number;
  mismatchedConversations: number;
  /** No ingest for over an hour while Chatwoot has active traffic. */
  stale: boolean;
}

export interface AgentsAuditResult {
  rows: AgentAuditRow[];
  freshness: AuditFreshness;
}

/** Chatwoot returns the true total for a status query in `meta.all_count`. */
function allCount(res: unknown): number | null {
  const r = res as { data?: { meta?: Record<string, unknown> }; meta?: Record<string, unknown> };
  const raw = r?.data?.meta?.all_count ?? r?.meta?.all_count;
  return typeof raw === "number" ? raw : null;
}

/**
 * Page the account's active conversations COMPLETELY and read the assignee off
 * each returned object.
 *
 * Correctness depends on scanning everything: a truncated snapshot under-counts
 * Chatwoot's side, which inflates every "dashboard has more than Chatwoot"
 * difference and makes the audit itself untrustworthy. So there is no low page
 * cap — we page each status until we have collected its `meta.all_count`, or a
 * page comes back short/empty. `maxPages` is only a runaway safety bound
 * (default 4000 pages ≈ 100k conversations); hitting it is a real anomaly and is
 * the ONLY thing that sets `truncated`.
 *
 * We deliberately do NOT pass `assignee_id`: it is not part of the documented
 * conversation-list contract, and a filter that silently does nothing would make
 * this audit lie in exactly the direction it exists to catch.
 */
export async function fetchLiveWorkload(
  client: ChatwootClient,
  opts: { maxPages?: number } = {},
): Promise<{ conversations: LiveConversation[]; pages: number; truncated: boolean }> {
  const safetyCap = Math.max(1, opts.maxPages ?? 4000);
  const byId = new Map<number, LiveConversation>();

  let pagesWalked = 0;
  let truncated = false;

  for (const status of ACTIVE_STATUSES) {
    let collected = 0;
    let total: number | null = null;

    for (let page = 1; page <= safetyCap; page++) {
      const res = await client.listConversations({ status, page, sort_order: "desc" });
      const batch = (res?.data?.payload ?? getPayload<CwConversation>(res)) as CwConversation[];
      pagesWalked++;
      if (page === 1) total = allCount(res);
      if (!batch.length) break;

      for (const c of batch) {
        if (typeof c.id !== "number") continue;
        const assignee = c.meta?.assignee ?? null;
        byId.set(c.id, {
          chatwootId: c.id,
          status: c.status ?? status,
          assigneeCwId: typeof assignee?.id === "number" ? assignee.id : null,
          assigneeName: assignee?.name ?? assignee?.available_name ?? null,
        });
      }
      collected += batch.length;

      // Done when Chatwoot's own total says so, or the page came back short.
      if (total !== null && collected >= total) break;
      if (total === null && batch.length < 20) break; // no count available → short-page heuristic

      if (page === safetyCap) truncated = true; // ran into the runaway bound
    }
  }

  return { conversations: [...byId.values()], pages: pagesWalked, truncated };
}

const setDiff = (a: Set<number>, b: Set<number>) => [...a].filter((x) => !b.has(x)).sort((x, y) => x - y);

/** Compare live Chatwoot against the database, per agent. */
export async function auditAgents(f: ReportFilters, opts: { maxPages?: number } = {}): Promise<AgentsAuditResult> {
  const client = new ChatwootClient();
  const snapshotAt = new Date();

  const live = await fetchLiveWorkload(client, opts);

  const liveWhere = conversationWhere(f, { ignoreDate: true });
  const periodWhere = conversationWhere(f);

  const [agents, dashActive, intervalAggregates, created, resolved, lastIngest] = await Promise.all([
    prisma.agent.findMany({ select: { id: true, name: true } }),
    prisma.conversation.findMany({
      where: { ...liveWhere, status: { in: [...ACTIVE_STATUSES] }, assigneeCwId: { not: null } },
      select: { chatwootId: true, assigneeCwId: true, status: true, needsReply: true },
    }),
    prisma.$queryRaw<AuditIntervalAggregate[]>(Prisma.sql`
      SELECT
        i."assigneeCwId" AS "agentId",
        COUNT(DISTINCT i."conversationCwId")::bigint AS "assignedInPeriod",
        COUNT(*)::bigint AS "assignmentEvents",
        COUNT(*) FILTER (WHERE i."responded" = TRUE)::bigint AS "responses"
      FROM "assignment_intervals" i
      WHERE i."startedAt" >= ${f.from} AND i."startedAt" <= ${f.to}
      GROUP BY i."assigneeCwId"
    `),
    prisma.conversation.groupBy({
      by: ["assigneeCwId"],
      where: { ...periodWhere, assigneeCwId: { not: null } },
      _count: { _all: true },
    }),
    prisma.conversation.groupBy({
      by: ["assigneeCwId"],
      where: { ...liveWhere, resolvedAt: { gte: f.from, lte: f.to }, assigneeCwId: { not: null } },
      _count: { _all: true },
    }),
    prisma.conversation.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);

  const nameById = new Map(agents.map((a) => [a.id, a.name ?? `#${a.id}`]));

  // Index both sides by agent.
  const liveByAgent = new Map<number, Set<number>>();
  const liveStatus = new Map<number, { open: number; pending: number; snoozed: number }>();
  for (const c of live.conversations) {
    if (c.assigneeCwId === null) continue;
    const set = liveByAgent.get(c.assigneeCwId) ?? new Set<number>();
    set.add(c.chatwootId);
    liveByAgent.set(c.assigneeCwId, set);

    const s = liveStatus.get(c.assigneeCwId) ?? { open: 0, pending: 0, snoozed: 0 };
    if (c.status === "open") s.open++;
    else if (c.status === "pending") s.pending++;
    else if (c.status === "snoozed") s.snoozed++;
    liveStatus.set(c.assigneeCwId, s);
    if (!nameById.has(c.assigneeCwId)) nameById.set(c.assigneeCwId, c.assigneeName ?? `#${c.assigneeCwId}`);
  }

  const dashByAgent = new Map<number, Set<number>>();
  const dashStatus = new Map<number, { open: number; pending: number; snoozed: number; needsReply: number }>();
  for (const c of dashActive) {
    if (c.assigneeCwId === null) continue;
    const set = dashByAgent.get(c.assigneeCwId) ?? new Set<number>();
    set.add(c.chatwootId);
    dashByAgent.set(c.assigneeCwId, set);

    const s = dashStatus.get(c.assigneeCwId) ?? { open: 0, pending: 0, snoozed: 0, needsReply: 0 };
    if (c.status === "open") s.open++;
    else if (c.status === "pending") s.pending++;
    else if (c.status === "snoozed") s.snoozed++;
    if (c.needsReply) s.needsReply++;
    dashStatus.set(c.assigneeCwId, s);
  }

  const uniqueAssigned = new Map<number, number>();
  const events = new Map<number, number>();
  const responses = new Map<number, number>();
  for (const aggregate of intervalAggregates) {
    uniqueAssigned.set(aggregate.agentId, numberValue(aggregate.assignedInPeriod));
    events.set(aggregate.agentId, numberValue(aggregate.assignmentEvents));
    responses.set(aggregate.agentId, numberValue(aggregate.responses));
  }

  const countBy = (rows: { assigneeCwId: number | null; _count: { _all: number } }[]) => {
    const m = new Map<number, number>();
    for (const r of rows) if (r.assigneeCwId !== null) m.set(r.assigneeCwId, r._count._all);
    return m;
  };
  const createdBy = countBy(created);
  const resolvedBy = countBy(resolved);

  const agentIds = new Set<number>([...nameById.keys(), ...liveByAgent.keys(), ...dashByAgent.keys()]);

  let mismatchedAgents = 0;
  let mismatchedConversations = 0;

  const rows: AgentAuditRow[] = [...agentIds].map((agentId) => {
    const liveSet = liveByAgent.get(agentId) ?? new Set<number>();
    const dashSet = dashByAgent.get(agentId) ?? new Set<number>();
    const ls = liveStatus.get(agentId) ?? { open: 0, pending: 0, snoozed: 0 };
    const ds = dashStatus.get(agentId) ?? { open: 0, pending: 0, snoozed: 0, needsReply: 0 };

    const missingInDashboard = setDiff(liveSet, dashSet);
    const notAssignedInChatwoot = setDiff(dashSet, liveSet);

    if (missingInDashboard.length || notAssignedInChatwoot.length) {
      mismatchedAgents++;
      mismatchedConversations += missingInDashboard.length + notAssignedInChatwoot.length;
    }

    return {
      agentId,
      name: nameById.get(agentId) ?? `#${agentId}`,
      chatwootOpen: ls.open,
      chatwootPending: ls.pending,
      chatwootSnoozed: ls.snoozed,
      chatwootActive: liveSet.size,
      dashboardOpen: ds.open,
      dashboardPending: ds.pending,
      dashboardSnoozed: ds.snoozed,
      dashboardActive: dashSet.size,
      difference: dashSet.size - liveSet.size,
      assignedInPeriod: uniqueAssigned.get(agentId) ?? 0,
      assignmentEvents: events.get(agentId) ?? 0,
      firstResponsesInPeriod: responses.get(agentId) ?? 0,
      createdInPeriod: createdBy.get(agentId) ?? 0,
      resolvedInPeriod: resolvedBy.get(agentId) ?? 0,
      needsReplyNow: ds.needsReply,
      missingInDashboard,
      notAssignedInChatwoot,
    };
  });

  rows.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference) || b.chatwootActive - a.chatwootActive);

  const lastIngestAt = lastIngest?.updatedAt ?? null;
  const stale =
    live.conversations.length > 0 &&
    (!lastIngestAt || Date.now() - lastIngestAt.getTime() > 60 * 60 * 1000);

  return {
    rows,
    freshness: {
      chatwootSnapshotAt: snapshotAt.toISOString(),
      lastIngestAt: lastIngestAt ? lastIngestAt.toISOString() : null,
      scanned: live.conversations.length,
      pages: live.pages,
      truncated: live.truncated,
      mismatchedAgents,
      mismatchedConversations,
      stale,
    },
  };
}

export interface AuditConversationEntry {
  chatwootId: number;
  chatwootStatus: string | null;
  chatwootAssigneeCwId: number | null;
  dashboardStatus: string | null;
  dashboardAssigneeCwId: number | null;
  reason: MismatchReason | "counted";
  /** Plain-language explanation, so the number never has to be taken on trust. */
  explanation: string;
}

/** One agent, every conversation id, and the exact reason it counts or does not. */
export async function auditAgentDetail(agentId: number, f: ReportFilters, opts: { maxPages?: number } = {}) {
  const client = new ChatwootClient();
  const snapshotAt = new Date();
  const live = await fetchLiveWorkload(client, opts);

  const liveTheirs = live.conversations.filter((c) => c.assigneeCwId === agentId);
  const liveIds = liveTheirs.map((c) => c.chatwootId);

  const liveWhere = conversationWhere(f, { ignoreDate: true });

  // Every local row for the ids in play, whoever holds them.
  const relevantIds = [...new Set(liveIds)];
  const [dashTheirs, dashForLiveIds, intervals] = await Promise.all([
    prisma.conversation.findMany({
      where: { ...liveWhere, assigneeCwId: agentId, status: { in: [...ACTIVE_STATUSES] } },
      select: { chatwootId: true, status: true, assigneeCwId: true },
    }),
    relevantIds.length
      ? prisma.conversation.findMany({
          where: { chatwootId: { in: relevantIds } },
          select: { chatwootId: true, status: true, assigneeCwId: true },
        })
      : Promise.resolve([]),
    prisma.assignmentInterval.findMany({
      where: { assigneeCwId: agentId, startedAt: { gte: f.from, lte: f.to } },
      select: { conversationCwId: true, startedAt: true, responded: true, responseSeconds: true },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const dashById = new Map(dashForLiveIds.map((c) => [c.chatwootId, c]));
  const dashTheirIds = new Set(dashTheirs.map((c) => c.chatwootId));
  const liveById = new Map(liveTheirs.map((c) => [c.chatwootId, c]));

  const countedAsWorkload: AuditConversationEntry[] = [];
  const missingInDashboard: AuditConversationEntry[] = [];
  const notAssignedInChatwoot: AuditConversationEntry[] = [];

  // Chatwoot says it is theirs. Do we agree?
  for (const c of liveTheirs) {
    const local = dashById.get(c.chatwootId);

    if (!local) {
      missingInDashboard.push({
        chatwootId: c.chatwootId,
        chatwootStatus: c.status,
        chatwootAssigneeCwId: c.assigneeCwId,
        dashboardStatus: null,
        dashboardAssigneeCwId: null,
        reason: "missing_in_dashboard",
        explanation: "المحادثة غير موجودة في قاعدة البيانات — لم تُستورد بعد (Backfill أو Webhook).",
      });
      continue;
    }

    if (local.assigneeCwId !== agentId) {
      missingInDashboard.push({
        chatwootId: c.chatwootId,
        chatwootStatus: c.status,
        chatwootAssigneeCwId: c.assigneeCwId,
        dashboardStatus: local.status,
        dashboardAssigneeCwId: local.assigneeCwId,
        reason: "different_assignee",
        explanation: `مُسندة في Chatwoot لهذا الموظف، وفي قاعدة البيانات لموظف آخر (${local.assigneeCwId ?? "غير مُسندة"}) — بيانات قديمة.`,
      });
      continue;
    }

    if (!ACTIVE_STATUSES.includes((local.status ?? "") as (typeof ACTIVE_STATUSES)[number])) {
      missingInDashboard.push({
        chatwootId: c.chatwootId,
        chatwootStatus: c.status,
        chatwootAssigneeCwId: c.assigneeCwId,
        dashboardStatus: local.status,
        dashboardAssigneeCwId: local.assigneeCwId,
        reason: "different_status",
        explanation: `حالتها في Chatwoot "${c.status}" وفي قاعدة البيانات "${local.status}" — لا تُحتسب ضمن الحمل الحالي.`,
      });
      continue;
    }

    countedAsWorkload.push({
      chatwootId: c.chatwootId,
      chatwootStatus: c.status,
      chatwootAssigneeCwId: c.assigneeCwId,
      dashboardStatus: local.status,
      dashboardAssigneeCwId: local.assigneeCwId,
      reason: "counted",
      explanation: "مطابِقة — تُحتسب ضمن الحمل الحالي.",
    });
  }

  // We say it is theirs. Does Chatwoot still agree?
  for (const c of dashTheirs) {
    if (liveById.has(c.chatwootId)) continue;
    notAssignedInChatwoot.push({
      chatwootId: c.chatwootId,
      chatwootStatus: null,
      chatwootAssigneeCwId: null,
      dashboardStatus: c.status,
      dashboardAssigneeCwId: c.assigneeCwId,
      reason: "not_assigned_in_chatwoot",
      explanation:
        "محسوبة على الموظف في قاعدة البيانات، لكنها لم تظهر في Chatwoot ضمن الحالات النشطة — أُغلقت أو أُعيد إسنادها.",
    });
  }

  const assignedIds = [...new Set(intervals.map((i) => i.conversationCwId))].sort((a, b) => a - b);

  return {
    agentId,
    freshness: {
      chatwootSnapshotAt: snapshotAt.toISOString(),
      scanned: live.conversations.length,
      pages: live.pages,
      truncated: live.truncated,
    },
    totals: {
      chatwootActive: liveTheirs.length,
      dashboardActive: dashTheirIds.size,
      difference: dashTheirIds.size - liveTheirs.length,
    },
    countedAsWorkload,
    missingInDashboard,
    notAssignedInChatwoot,
    periodAssignment: {
      uniqueConversations: assignedIds.length,
      events: intervals.length,
      responses: intervals.filter((i) => i.responded).length,
      conversationIds: assignedIds,
    },
  };
}

export interface ReconcileStats {
  scanned: number;
  mismatched: number;
  reIngested: number;
  failed: number;
  /** Mismatches left unfixed because the per-run fetch cap was hit. 0 = fully reconciled. */
  remaining: number;
  /** The live snapshot ran into its runaway safety bound — numbers may be partial. */
  snapshotTruncated: boolean;
  errors: string[];
}

/**
 * Repair the mismatches by re-ingesting the affected conversations from Chatwoot.
 *
 * The only write path in the audit, and it writes only to the analytics database.
 * Idempotent: re-ingesting a conversation recomputes it from scratch, so running
 * this twice cannot double anything.
 */
export async function reconcileCurrentWorkload(opts: { maxPages?: number; maxFetch?: number } = {}): Promise<ReconcileStats> {
  // Default high enough to clear a normal mismatch set in one pass. If it is ever
  // hit, `remaining` says so and re-running finishes the job (it is idempotent).
  const maxFetch = Math.max(1, Math.min(opts.maxFetch ?? 5000, 20000));
  const client = new ChatwootClient();

  const live = await fetchLiveWorkload(client, opts);
  const liveById = new Map(live.conversations.map((c) => [c.chatwootId, c]));

  const local = await prisma.conversation.findMany({
    where: {
      OR: [
        { chatwootId: { in: [...liveById.keys()] } },
        { status: { in: [...ACTIVE_STATUSES] } },
      ],
    },
    select: { chatwootId: true, status: true, assigneeCwId: true },
  });
  const localById = new Map(local.map((c) => [c.chatwootId, c]));

  // Anything where the two disagree about assignee or active-ness.
  const suspect = new Set<number>();

  for (const [id, c] of liveById) {
    const l = localById.get(id);
    if (!l) suspect.add(id);
    else if (l.assigneeCwId !== c.assigneeCwId) suspect.add(id);
    else if (l.status !== c.status) suspect.add(id);
  }
  for (const l of local) {
    if (!liveById.has(l.chatwootId) && ACTIVE_STATUSES.includes((l.status ?? "") as (typeof ACTIVE_STATUSES)[number])) {
      // We think it is active; Chatwoot's active pages never returned it.
      suspect.add(l.chatwootId);
    }
  }

  const stats: ReconcileStats = {
    scanned: live.conversations.length,
    mismatched: suspect.size,
    reIngested: 0,
    failed: 0,
    remaining: 0,
    snapshotTruncated: live.truncated,
    errors: [],
  };

  const ctx = await buildAssembleContext();
  let fetched = 0;

  for (const id of suspect) {
    if (fetched >= maxFetch) {
      // Don't silently stop — say how many are left so a re-run finishes them.
      stats.remaining = suspect.size - fetched;
      break;
    }
    fetched++;
    try {
      const [detail, messages] = await Promise.all([
        client.conversationDetails(id),
        fetchAllMessages(client, id),
      ]);
      await persistConversation(assembleConversation(detail, messages, { ...ctx, now: new Date() }));
      stats.reIngested++;
    } catch (error) {
      stats.failed++;
      if (stats.errors.length < 20) stats.errors.push(`${id}: ${(error as Error).message}`.slice(0, 160));
    }
  }

  return stats;
}
