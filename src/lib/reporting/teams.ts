import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchLiveCountsByEntity, supportsLiveFilters } from "@/lib/chatwoot/liveCounts";
import { average, median } from "@/lib/format";
import {
  resolveConversationTeam,
  membershipIndex,
  membersByTeam,
  type TeamAttributionSource,
} from "@/lib/metrics/teamAttribution";
import { conversationWhere, type ReportFilters } from "./filters";
import { andSql, conversationSqlConditions } from "./sqlFilters";
import { currentWorkloadPage, type DetailConversationRow, type DetailConversations } from "./agents";

/** The unattributed bucket — conversations we refuse to guess a team for. */
export const NO_TEAM_ID = -1;
export const NO_TEAM_LABEL = "غير محدد";

export interface TeamRow {
  teamCwId: number;
  name: string;
  department: string | null;
  memberCount: number;
  activeMembers: number;
  /** Live: open + pending + snoozed on this team right now. No date bound. */
  currentWorkload: number;
  /** Live open conversations, from the same snapshot as currentWorkload. */
  currentOpen: number;
  /** Live pending + snoozed conversations. */
  currentWaiting: number;
  /** Conversations attributed to the team in the period (see teamAttribution). */
  conversations: number;
  open: number;
  pending: number;
  resolved: number;
  replied: number;
  needsReply: number;
  unread: number;
  avgResponseSeconds: number | null;
  medianResponseSeconds: number | null;
  maxResponseSeconds: number | null;
  avgResolutionSeconds: number | null;
  slaBreaches: number;
  campaignReplies: number;
  botHandoffs: number;
  lastActivityAt: Date | null;
  hasActivity: boolean;
}

export interface TeamMemberRow {
  agentId: number;
  name: string;
  email: string | null;
  availability: string | null;
  assigned: number;
  replied: number;
  needsReply: number;
  open: number;
  resolved: number;
  avgResponseSeconds: number | null;
  medianResponseSeconds: number | null;
  maxResponseSeconds: number | null;
  slaBreaches: number;
  /** Conversations still open right now — the load they are carrying. */
  openLoad: number;
  /** Open + pending + snoozed right now. */
  currentWorkload: number;
  /** Pending + snoozed right now. */
  currentWaiting: number;
  lastActivityAt: Date | null;
  hasActivity: boolean;
}

export interface TeamsSummary {
  totalTeams: number;
  activeTeams: number;
  /** Live total across teams. */
  currentWorkload: number;
  currentOpen: number;
  currentWaiting: number;
  conversations: number;
  avgResponseSeconds: number | null;
  slaBreaches: number;
  needsReply: number;
}

export interface TeamsReport {
  rows: TeamRow[];
  summary: TeamsSummary;
  /** How each conversation got its team — surfaced so the numbers stay auditable. */
  attribution: Record<TeamAttributionSource, number>;
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

/* ── Inputs (kept structural so the builder stays pure and testable) ────────── */

export interface TeamRecord {
  id: number;
  name: string | null;
  department: string | null;
}

export interface AgentRecord {
  id: number;
  name: string | null;
  email: string | null;
  availability: string | null;
}

export interface Membership {
  teamCwId: number;
  agentCwId: number;
}

export interface TeamConversation {
  chatwootId: number;
  teamCwId: number | null;
  assigneeCwId: number | null;
  status: string | null;
  needsReply: boolean;
  handledByHuman: boolean;
  unreadCount: number;
  responseSeconds: number | null;
  conversationDurationSeconds: number | null;
  slaFirstResponseBreached: boolean;
  isCampaign: boolean;
  botInvolved: boolean;
  lastMessageAt: Date | null;
}

interface Bucket {
  resp: number[];
  res: number[];
  agents: Set<number>;
}

const laterOf = (a: Date | null, b: Date | null): Date | null => {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
};

function emptyTeamRow(teamCwId: number, name: string, department: string | null, memberCount: number): TeamRow {
  return {
    teamCwId,
    name,
    department,
    memberCount,
    activeMembers: 0,
    currentWorkload: 0,
    currentOpen: 0,
    currentWaiting: 0,
    conversations: 0,
    open: 0,
    pending: 0,
    resolved: 0,
    replied: 0,
    needsReply: 0,
    unread: 0,
    avgResponseSeconds: null,
    medianResponseSeconds: null,
    maxResponseSeconds: null,
    avgResolutionSeconds: null,
    slaBreaches: 0,
    campaignReplies: 0,
    botHandoffs: 0,
    lastActivityAt: null,
    hasActivity: false,
  };
}

/**
 * Merge the period's conversations onto the FULL team roster.
 *
 * Every team from Chatwoot appears, active or not — the date range decides the
 * numbers, never who is in the table. A conversation lands in exactly one team
 * (see teamAttribution), so team totals never exceed the real conversation count.
 */
export function buildTeamsReport(input: {
  teams: TeamRecord[];
  memberships: Membership[];
  conversations: TeamConversation[];
  activeOnly?: boolean;
  /** Assignment-time team per conversation, for the ones Chatwoot no longer teams. */
  assignmentTeamByConversation?: ReadonlyMap<number, number>;
  /** Live active conversations per team id — NOT filtered by the date range. */
  currentByTeam?: ReadonlyMap<number, number>;
}): TeamsReport {
  const { teams, memberships, conversations, activeOnly = false, assignmentTeamByConversation, currentByTeam } = input;

  const byAgent = membershipIndex(memberships);
  const byTeam = membersByTeam(memberships);

  const rows = new Map<number, TeamRow>();
  const buckets = new Map<number, Bucket>();
  const bucket = (id: number): Bucket => {
    let b = buckets.get(id);
    if (!b) {
      b = { resp: [], res: [], agents: new Set() };
      buckets.set(id, b);
    }
    return b;
  };

  // 1. Seed every team — this is what keeps a quiet team on the screen.
  for (const t of teams) {
    rows.set(t.id, emptyTeamRow(t.id, t.name || `#${t.id}`, t.department, (byTeam.get(t.id) ?? []).length));
  }

  const attribution: Record<TeamAttributionSource, number> = {
    conversation: 0,
    assignment: 0,
    membership: 0,
    none: 0,
  };

  // 2. Attribute each conversation to exactly one team.
  for (const c of conversations) {
    const { teamCwId, source } = resolveConversationTeam({
      conversationTeamCwId: c.teamCwId,
      assignmentTeamCwId: assignmentTeamByConversation?.get(c.chatwootId) ?? null,
      assigneeCwId: c.assigneeCwId,
      membershipsByAgent: byAgent,
    });
    attribution[source]++;

    const id = teamCwId ?? NO_TEAM_ID;
    let row = rows.get(id);
    if (!row) {
      // Either the unattributed bucket, or a team that vanished from Chatwoot
      // but still owns history — never drop the numbers on the floor.
      row = emptyTeamRow(
        id,
        id === NO_TEAM_ID ? NO_TEAM_LABEL : `#${id}`,
        null,
        (byTeam.get(id) ?? []).length,
      );
      rows.set(id, row);
    }

    const b = bucket(id);
    row.conversations++;
    row.hasActivity = true;
    if (c.status === "open") row.open++;
    if (c.status === "pending") row.pending++;
    if (c.status === "resolved") row.resolved++;
    if (c.handledByHuman) row.replied++;
    if (c.needsReply) row.needsReply++;
    if (c.unreadCount > 0) row.unread++;
    if (c.slaFirstResponseBreached) row.slaBreaches++;
    if (c.isCampaign && c.handledByHuman) row.campaignReplies++;
    if (c.botInvolved) row.botHandoffs++;
    row.lastActivityAt = laterOf(row.lastActivityAt, c.lastMessageAt);
    if (c.responseSeconds !== null) b.resp.push(c.responseSeconds);
    if (c.conversationDurationSeconds !== null) b.res.push(c.conversationDurationSeconds);
    if (c.assigneeCwId !== null) b.agents.add(c.assigneeCwId);
  }

  for (const [id, b] of buckets) {
    const row = rows.get(id)!;
    row.avgResponseSeconds = average(b.resp);
    row.medianResponseSeconds = median(b.resp);
    row.maxResponseSeconds = b.resp.length ? Math.max(...b.resp) : null;
    row.avgResolutionSeconds = average(b.res);
    row.activeMembers = b.agents.size;
  }

  // Live workload — a separate question from "what happened in the period".
  if (currentByTeam) {
    for (const [teamId, n] of currentByTeam) {
      const r = rows.get(teamId);
      if (r) r.currentWorkload = n;
    }
  }

  const all = [...rows.values()];
  const real = all.filter((r) => r.teamCwId !== NO_TEAM_ID);

  // The summary describes the whole roster; the toggle only hides rows.
  const summary: TeamsSummary = {
    totalTeams: real.length,
    activeTeams: real.filter((r) => r.hasActivity).length,
    currentWorkload: all.reduce((n, r) => n + r.currentWorkload, 0),
    currentOpen: all.reduce((n, r) => n + r.currentOpen, 0),
    currentWaiting: all.reduce((n, r) => n + r.currentWaiting, 0),
    conversations: conversations.length,
    avgResponseSeconds: average(conversations.map((c) => c.responseSeconds).filter((v): v is number => v !== null)),
    slaBreaches: all.reduce((sum, r) => sum + r.slaBreaches, 0),
    needsReply: all.reduce((sum, r) => sum + r.needsReply, 0),
  };

  for (const r of all) r.hasActivity = r.hasActivity || r.currentWorkload > 0;

  const visible = activeOnly ? all.filter((r) => r.hasActivity) : all;

  visible.sort((a, b) => {
    // The unattributed bucket always sits last — it is a footnote, not a team.
    if (a.teamCwId === NO_TEAM_ID) return 1;
    if (b.teamCwId === NO_TEAM_ID) return -1;
    if (a.hasActivity !== b.hasActivity) return a.hasActivity ? -1 : 1;
    if (b.conversations !== a.conversations) return b.conversations - a.conversations;
    return a.name.localeCompare(b.name, "ar");
  });

  return { rows: visible, summary, attribution };
}

/**
 * Every member of one team, with that team's conversations only.
 *
 * The roster comes from team_memberships, so a member who handled nothing in the
 * window still appears at zero. Metrics are scoped to conversations that landed
 * in THIS team — an agent in two teams does not carry the other team's numbers.
 */
export function buildTeamMembers(input: {
  memberIds: number[];
  agents: AgentRecord[];
  /** Already narrowed to the team's conversations. */
  conversations: TeamConversation[];
  activeOnly?: boolean;
}): TeamMemberRow[] {
  const { memberIds, agents, conversations, activeOnly = false } = input;
  const agentById = new Map(agents.map((a) => [a.id, a]));

  const rows = new Map<number, TeamMemberRow>();
  const resp = new Map<number, number[]>();

  const seed = (id: number) => {
    const info = agentById.get(id);
    rows.set(id, {
      agentId: id,
      name: info?.name || `#${id}`,
      email: info?.email ?? null,
      availability: info?.availability ?? null,
      assigned: 0,
      replied: 0,
      needsReply: 0,
      open: 0,
      resolved: 0,
      avgResponseSeconds: null,
      medianResponseSeconds: null,
      maxResponseSeconds: null,
      slaBreaches: 0,
      openLoad: 0,
      currentWorkload: 0,
      currentWaiting: 0,
      lastActivityAt: null,
      hasActivity: false,
    });
  };

  for (const id of memberIds) seed(id);

  for (const c of conversations) {
    if (c.assigneeCwId === null) continue;
    // Someone who worked the team's conversations without being on the roster
    // (just left the team, say) still gets a row — their work happened.
    if (!rows.has(c.assigneeCwId)) seed(c.assigneeCwId);

    const row = rows.get(c.assigneeCwId)!;
    row.assigned++;
    row.hasActivity = true;
    if (c.handledByHuman) row.replied++;
    if (c.needsReply) row.needsReply++;
    if (c.status === "open") {
      row.open++;
      row.openLoad++;
    }
    if (c.status === "resolved") row.resolved++;
    if (c.slaFirstResponseBreached) row.slaBreaches++;
    row.lastActivityAt = laterOf(row.lastActivityAt, c.lastMessageAt);

    if (c.responseSeconds !== null) {
      const list = resp.get(c.assigneeCwId) ?? [];
      list.push(c.responseSeconds);
      resp.set(c.assigneeCwId, list);
    }
  }

  for (const [agentId, list] of resp) {
    const row = rows.get(agentId)!;
    row.avgResponseSeconds = average(list);
    row.medianResponseSeconds = median(list);
    row.maxResponseSeconds = list.length ? Math.max(...list) : null;
  }

  const all = [...rows.values()];
  const visible = activeOnly ? all.filter((r) => r.hasActivity) : all;

  visible.sort((a, b) => {
    if (a.hasActivity !== b.hasActivity) return a.hasActivity ? -1 : 1;
    if (b.assigned !== a.assigned) return b.assigned - a.assigned;
    return a.name.localeCompare(b.name, "ar");
  });

  return visible;
}

/* ── Query layer ───────────────────────────────────────────────────────────── */

const CONVERSATION_SELECT = {
  chatwootId: true,
  teamCwId: true,
  assigneeCwId: true,
  status: true,
  needsReply: true,
  handledByHuman: true,
  unreadCount: true,
  responseSeconds: true,
  conversationDurationSeconds: true,
  slaFirstResponseBreached: true,
  isCampaign: true,
  botInvolved: true,
  lastMessageAt: true,
} as const;

/**
 * Pull the assignment-time team for conversations Chatwoot no longer teams.
 * Only the orphans are looked up, so this stays cheap.
 */
async function assignmentTeams(conversations: { chatwootId: number; teamCwId: number | null }[]) {
  const orphans = conversations.filter((c) => c.teamCwId === null).map((c) => c.chatwootId);
  if (!orphans.length) return new Map<number, number>();

  const intervals = await prisma.assignmentInterval.findMany({
    where: { conversationCwId: { in: orphans }, teamCwId: { not: null } },
    select: { conversationCwId: true, teamCwId: true, startedAt: true },
    orderBy: { startedAt: "asc" },
  });

  // Last assignment wins — the team it was in most recently.
  const map = new Map<number, number>();
  for (const i of intervals) {
    if (i.teamCwId !== null) map.set(i.conversationCwId, i.teamCwId);
  }
  return map;
}

export async function getTeams(f: ReportFilters): Promise<TeamsReport> {
  const activeStatuses = ["open", "pending", "snoozed"].filter(
    (status) => !f.status?.length || f.status.includes(status),
  );
  const cte = attributedConversationsCte(f);
  const teamFilter = attributedTeamFilter(f.teamId);

  const [teams, memberships, periodRows, attributionRows, databaseCurrent] = await Promise.all([
    prisma.team.findMany({
      select: { id: true, name: true, department: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.teamMembership.findMany({ select: { teamCwId: true, agentCwId: true } }),
    prisma.$queryRaw<TeamAggregate[]>(Prisma.sql`
      ${cte}
      SELECT
        a."attributedTeamCwId" AS "teamId",
        COUNT(*)::bigint AS "conversations",
        COUNT(*) FILTER (WHERE a."status" = 'open')::bigint AS "open",
        COUNT(*) FILTER (WHERE a."status" = 'pending')::bigint AS "pending",
        COUNT(*) FILTER (WHERE a."status" = 'resolved')::bigint AS "resolved",
        COUNT(*) FILTER (WHERE a."handledByHuman" = TRUE)::bigint AS "replied",
        COUNT(*) FILTER (WHERE a."needsReply" = TRUE)::bigint AS "needsReply",
        COUNT(*) FILTER (WHERE a."unreadCount" > 0)::bigint AS "unread",
        COUNT(DISTINCT a."assigneeCwId") FILTER (WHERE a."assigneeCwId" IS NOT NULL)::bigint AS "activeMembers",
        COUNT(a."responseSeconds")::bigint AS "responseCount",
        COALESCE(SUM(a."responseSeconds"), 0)::bigint AS "responseTotal",
        AVG(a."responseSeconds")::double precision AS "avgResponseSeconds",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY a."responseSeconds") FILTER (
          WHERE a."responseSeconds" IS NOT NULL
        )::double precision AS "medianResponseSeconds",
        MAX(a."responseSeconds")::double precision AS "maxResponseSeconds",
        AVG(a."conversationDurationSeconds")::double precision AS "avgResolutionSeconds",
        COUNT(*) FILTER (WHERE a."slaFirstResponseBreached" = TRUE)::bigint AS "slaBreaches",
        COUNT(*) FILTER (WHERE a."isCampaign" = TRUE AND a."handledByHuman" = TRUE)::bigint AS "campaignReplies",
        COUNT(*) FILTER (WHERE a."botInvolved" = TRUE)::bigint AS "botHandoffs",
        MAX(a."lastMessageAt") AS "lastActivityAt"
      FROM "attributed" a
      ${teamFilter}
      GROUP BY a."attributedTeamCwId"
    `),
    prisma.$queryRaw<AttributionAggregate[]>(Prisma.sql`
      ${cte}
      SELECT a."attributionSource" AS "source", COUNT(*)::bigint AS "count"
      FROM "attributed" a
      ${teamFilter}
      GROUP BY a."attributionSource"
    `),
    activeStatuses.length
      ? prisma.conversation.groupBy({
          by: ["teamCwId", "status"],
          where: {
            ...conversationWhere(f, { ignoreDate: true }),
            teamCwId: { not: null },
            status: { in: activeStatuses },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const memberCounts = new Map<number, number>();
  for (const membership of memberships) {
    memberCounts.set(membership.teamCwId, (memberCounts.get(membership.teamCwId) ?? 0) + 1);
  }

  const rows = new Map<number, TeamRow>();
  for (const team of teams) {
    rows.set(team.id, emptyTeamRow(team.id, team.name || `#${team.id}`, team.department, memberCounts.get(team.id) ?? 0));
  }

  for (const aggregate of periodRows) {
    const id = aggregate.teamId;
    let row = rows.get(id);
    if (!row) {
      row = emptyTeamRow(
        id,
        id === NO_TEAM_ID ? NO_TEAM_LABEL : `#${id}`,
        null,
        memberCounts.get(id) ?? 0,
      );
      rows.set(id, row);
    }
    row.conversations = asNumber(aggregate.conversations);
    row.open = asNumber(aggregate.open);
    row.pending = asNumber(aggregate.pending);
    row.resolved = asNumber(aggregate.resolved);
    row.replied = asNumber(aggregate.replied);
    row.needsReply = asNumber(aggregate.needsReply);
    row.unread = asNumber(aggregate.unread);
    row.activeMembers = asNumber(aggregate.activeMembers);
    row.avgResponseSeconds = nullableNumber(aggregate.avgResponseSeconds);
    row.medianResponseSeconds = nullableNumber(aggregate.medianResponseSeconds);
    row.maxResponseSeconds = nullableNumber(aggregate.maxResponseSeconds);
    row.avgResolutionSeconds = nullableNumber(aggregate.avgResolutionSeconds);
    row.slaBreaches = asNumber(aggregate.slaBreaches);
    row.campaignReplies = asNumber(aggregate.campaignReplies);
    row.botHandoffs = asNumber(aggregate.botHandoffs);
    row.lastActivityAt = aggregate.lastActivityAt;
  }

  for (const group of databaseCurrent) {
    if (group.teamCwId === null) continue;
    const row = rows.get(group.teamCwId);
    if (!row) continue;
    const count = group._count._all;
    row.currentWorkload += count;
    if (group.status === "open") row.currentOpen += count;
    else row.currentWaiting += count;
  }

  const databaseTotal = [...rows.values()].reduce((sum, row) => sum + row.currentWorkload, 0);
  const liveSupported = supportsLiveFilters(f);
  const liveCounts = liveSupported
    ? await fetchLiveCountsByEntity("team", teams.map((team) => team.id), f).catch(() => null)
    : null;
  if (liveCounts) {
    for (const count of liveCounts.counts) {
      const row = rows.get(count.id);
      if (!row) continue;
      row.currentOpen = count.open;
      row.currentWaiting = Math.max(0, count.active - count.open);
      row.currentWorkload = count.active;
    }
  }

  const attribution: Record<TeamAttributionSource, number> = {
    conversation: 0,
    assignment: 0,
    membership: 0,
    none: 0,
  };
  for (const aggregate of attributionRows) {
    if (aggregate.source in attribution) {
      attribution[aggregate.source as TeamAttributionSource] = asNumber(aggregate.count);
    }
  }

  const allRows = [...rows.values()];
  for (const row of allRows) row.hasActivity = row.conversations > 0 || row.currentWorkload > 0;

  const responseCount = periodRows.reduce((sum, row) => sum + asNumber(row.responseCount), 0);
  const responseTotal = periodRows.reduce((sum, row) => sum + asNumber(row.responseTotal), 0);
  const realRows = allRows.filter((row) => row.teamCwId !== NO_TEAM_ID);
  const summary: TeamsSummary = {
    totalTeams: realRows.length,
    activeTeams: realRows.filter((row) => row.hasActivity).length,
    currentWorkload: allRows.reduce((sum, row) => sum + row.currentWorkload, 0),
    currentOpen: allRows.reduce((sum, row) => sum + row.currentOpen, 0),
    currentWaiting: allRows.reduce((sum, row) => sum + row.currentWaiting, 0),
    conversations: allRows.reduce((sum, row) => sum + row.conversations, 0),
    avgResponseSeconds: responseCount ? responseTotal / responseCount : null,
    slaBreaches: allRows.reduce((sum, row) => sum + row.slaBreaches, 0),
    needsReply: allRows.reduce((sum, row) => sum + row.needsReply, 0),
  };

  const visible = f.activeOnly ? allRows.filter((row) => row.hasActivity) : allRows;
  visible.sort((a, b) => {
    if (a.teamCwId === NO_TEAM_ID) return 1;
    if (b.teamCwId === NO_TEAM_ID) return -1;
    if (a.hasActivity !== b.hasActivity) return a.hasActivity ? -1 : 1;
    if (b.currentWorkload !== a.currentWorkload) return b.currentWorkload - a.currentWorkload;
    if (b.conversations !== a.conversations) return b.conversations - a.conversations;
    return a.name.localeCompare(b.name, "en");
  });

  const chatwootTotal = liveCounts ? liveCounts.counts.reduce((sum, count) => sum + count.active, 0) : null;
  return {
    rows: visible,
    summary,
    attribution,
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

/** One team: its row, its members, and how it trended. */
export async function getTeamDetail(teamId: number, f: ReportFilters) {
  const [team, report, members] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId } }),
    getTeams({ ...f, teamId: [teamId], activeOnly: false }),
    getTeamMembers(teamId, f),
  ]);
  const row = report.rows.find((r) => r.teamCwId === teamId) ?? null;
  return { team, row, members, conversationCount: row?.conversations ?? 0, live: report.live };
}

export async function getTeamMembers(teamId: number, f: ReportFilters): Promise<TeamMemberRow[]> {
  const scoped = { ...f, teamId: undefined };
  const cte = attributedConversationsCte(scoped);
  const activeStatuses = ["open", "pending", "snoozed"].filter(
    (status) => !f.status?.length || f.status.includes(status),
  );
  const [memberships, aggregates, databaseCurrent] = await Promise.all([
    prisma.teamMembership.findMany({
      where: { teamCwId: teamId },
      select: {
        agentCwId: true,
        agent: { select: { id: true, name: true, email: true, availability: true } },
      },
    }),
    prisma.$queryRaw<TeamMemberAggregate[]>(Prisma.sql`
      ${cte}
      SELECT
        a."assigneeCwId" AS "agentId",
        MAX(a."assigneeName") AS "fallbackName",
        COUNT(*)::bigint AS "assigned",
        COUNT(*) FILTER (WHERE a."handledByHuman" = TRUE)::bigint AS "replied",
        COUNT(*) FILTER (WHERE a."needsReply" = TRUE)::bigint AS "needsReply",
        COUNT(*) FILTER (WHERE a."status" = 'open')::bigint AS "open",
        COUNT(*) FILTER (WHERE a."status" = 'resolved')::bigint AS "resolved",
        AVG(a."responseSeconds")::double precision AS "avgResponseSeconds",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY a."responseSeconds") FILTER (
          WHERE a."responseSeconds" IS NOT NULL
        )::double precision AS "medianResponseSeconds",
        MAX(a."responseSeconds")::double precision AS "maxResponseSeconds",
        COUNT(*) FILTER (WHERE a."slaFirstResponseBreached" = TRUE)::bigint AS "slaBreaches",
        MAX(a."lastMessageAt") AS "lastActivityAt"
      FROM "attributed" a
      WHERE a."attributedTeamCwId" = ${teamId} AND a."assigneeCwId" IS NOT NULL
      GROUP BY a."assigneeCwId"
    `),
    activeStatuses.length
      ? prisma.conversation.groupBy({
          by: ["assigneeCwId", "status"],
          where: {
            ...conversationWhere({ ...f, teamId: [teamId] }, { ignoreDate: true }),
            assigneeCwId: { not: null },
            status: { in: activeStatuses },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const rows = new Map<number, TeamMemberRow>();
  for (const membership of memberships) rows.set(membership.agentCwId, emptyMemberRow(membership.agent));
  for (const aggregate of aggregates) {
    if (aggregate.agentId === null) continue;
    let row = rows.get(aggregate.agentId);
    if (!row) {
      row = emptyMemberRow({ id: aggregate.agentId, name: aggregate.fallbackName, email: null, availability: null });
      rows.set(aggregate.agentId, row);
    }
    row.assigned = asNumber(aggregate.assigned);
    row.replied = asNumber(aggregate.replied);
    row.needsReply = asNumber(aggregate.needsReply);
    row.open = asNumber(aggregate.open);
    row.resolved = asNumber(aggregate.resolved);
    row.avgResponseSeconds = nullableNumber(aggregate.avgResponseSeconds);
    row.medianResponseSeconds = nullableNumber(aggregate.medianResponseSeconds);
    row.maxResponseSeconds = nullableNumber(aggregate.maxResponseSeconds);
    row.slaBreaches = asNumber(aggregate.slaBreaches);
    row.lastActivityAt = aggregate.lastActivityAt;
  }

  for (const group of databaseCurrent) {
    if (group.assigneeCwId === null) continue;
    const row = rows.get(group.assigneeCwId);
    if (!row) continue;
    const count = group._count._all;
    row.currentWorkload += count;
    if (group.status === "open") row.openLoad += count;
    else row.currentWaiting += count;
  }

  const liveSupported = supportsLiveFilters({ ...f, teamId: [teamId] });
  const liveCounts = liveSupported
    ? await fetchLiveCountsByEntity("agent", [...rows.keys()], { ...f, teamId: [teamId] }).catch(() => null)
    : null;
  if (liveCounts) {
    for (const count of liveCounts.counts) {
      const row = rows.get(count.id);
      if (!row) continue;
      row.openLoad = count.open;
      row.currentWaiting = Math.max(0, count.active - count.open);
      row.currentWorkload = count.active;
    }
  }

  const allRows = [...rows.values()];
  for (const row of allRows) row.hasActivity = row.assigned > 0 || row.currentWorkload > 0;
  const visible = f.activeOnly ? allRows.filter((row) => row.hasActivity) : allRows;
  visible.sort((a, b) => {
    if (a.hasActivity !== b.hasActivity) return a.hasActivity ? -1 : 1;
    if (b.currentWorkload !== a.currentWorkload) return b.currentWorkload - a.currentWorkload;
    if (b.assigned !== a.assigned) return b.assigned - a.assigned;
    return a.name.localeCompare(b.name, "en");
  });
  return visible;
}

/** Paginated conversation list for a team (optionally one member of it). */
export async function getTeamConversations(
  teamId: number,
  f: ReportFilters,
  page = 1,
  pageSize = 50,
  memberId?: number,
  view: "current" | "history" = "current",
): Promise<DetailConversations> {
  const scoped = {
    ...f,
    teamId: undefined,
    agentId: memberId ? [memberId] : f.agentId,
  };

  // Current workload: the live Chatwoot list, so it matches the header count and
  // no reassigned/reopened conversation is silently missing. The member filter
  // rides along as an assignee_id clause inside the same live filter.
  if (view === "current") {
    return currentWorkloadPage("team", teamId, scoped, page);
  }

  // Period history: the mirror, with the single-team attribution CTE.
  const size = Math.min(Math.max(pageSize, 1), 200);
  const currentPage = Math.max(page, 1);
  const skip = (currentPage - 1) * size;
  const cte = attributedConversationsCte(scoped);

  const [totalRows, rows] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint | number | string }>>(Prisma.sql`
      ${cte}
      SELECT COUNT(*)::bigint AS "count"
      FROM "attributed" a
      WHERE a."attributedTeamCwId" = ${teamId}
    `),
    prisma.$queryRaw<TeamConversationListRow[]>(Prisma.sql`
      ${cte}
      SELECT
        a."chatwootId",
        a."displayId",
        a."contactName",
        a."contactPhone",
        a."status",
        a."department",
        a."inboxName",
        a."assigneeName",
        a."assigneeCwId",
        a."needsReply",
        a."responseSeconds",
        a."conversationDurationSeconds",
        a."campaignLabel",
        a."botInvolved",
        a."slaFirstResponseBreached",
        a."lastMessageAt",
        a."createdAtCw"
      FROM "attributed" a
      WHERE a."attributedTeamCwId" = ${teamId}
      ORDER BY COALESCE(a."lastMessageAt", a."createdAtCw") DESC NULLS LAST, a."chatwootId" DESC
      LIMIT ${size} OFFSET ${skip}
    `),
  ]);
  const total = asNumber(totalRows[0]?.count);
  return {
    rows: rows.map(teamRowToDetail),
    total,
    page: currentPage,
    pageSize: size,
    pages: Math.ceil(total / size),
    source: "database",
    snapshotAt: null,
    exact: false,
  };
}

function teamRowToDetail(r: TeamConversationListRow): DetailConversationRow {
  return {
    chatwootId: r.chatwootId,
    displayId: r.displayId ?? null,
    contactName: r.contactName,
    contactPhone: r.contactPhone,
    status: r.status,
    assigneeCwId: r.assigneeCwId,
    assigneeName: r.assigneeName,
    department: r.department,
    inboxName: r.inboxName,
    needsReply: r.needsReply,
    responseSeconds: r.responseSeconds,
    conversationDurationSeconds: r.conversationDurationSeconds,
    campaignLabel: r.campaignLabel,
    botInvolved: r.botInvolved,
    lastMessageAt: r.lastMessageAt ? r.lastMessageAt.toISOString() : null,
    waitingSince: null,
    slaFirstResponseBreached: r.slaFirstResponseBreached,
    inDatabase: true,
  };
}

function attributedConversationsCte(f: ReportFilters): Prisma.Sql {
  const conditions = conversationSqlConditions(f, { alias: "c", ignoreTeam: true });
  return Prisma.sql`
    WITH "attributed" AS (
      SELECT
        c.*,
        COALESCE(c."teamCwId", latest."teamCwId", sole."teamCwId", ${NO_TEAM_ID})::int AS "attributedTeamCwId",
        CASE
          WHEN c."teamCwId" IS NOT NULL THEN 'conversation'
          WHEN latest."teamCwId" IS NOT NULL THEN 'assignment'
          WHEN sole."teamCwId" IS NOT NULL THEN 'membership'
          ELSE 'none'
        END AS "attributionSource"
      FROM "conversations" c
      LEFT JOIN LATERAL (
        SELECT i."teamCwId"
        FROM "assignment_intervals" i
        WHERE i."conversationCwId" = c."chatwootId" AND i."teamCwId" IS NOT NULL
        ORDER BY i."startedAt" DESC
        LIMIT 1
      ) latest ON TRUE
      LEFT JOIN LATERAL (
        SELECT MIN(m."teamCwId")::int AS "teamCwId"
        FROM "team_memberships" m
        WHERE m."agentCwId" = c."assigneeCwId"
        HAVING COUNT(*) = 1
      ) sole ON TRUE
      ${andSql(conditions)}
    )
  `;
}

function attributedTeamFilter(teamIds?: number[]): Prisma.Sql {
  return teamIds?.length
    ? Prisma.sql`WHERE a."attributedTeamCwId" IN (${Prisma.join(teamIds)})`
    : Prisma.empty;
}

function emptyMemberRow(agent: AgentRecord): TeamMemberRow {
  return {
    agentId: agent.id,
    name: agent.name || `#${agent.id}`,
    email: agent.email,
    availability: agent.availability,
    assigned: 0,
    replied: 0,
    needsReply: 0,
    open: 0,
    resolved: 0,
    avgResponseSeconds: null,
    medianResponseSeconds: null,
    maxResponseSeconds: null,
    slaBreaches: 0,
    openLoad: 0,
    currentWorkload: 0,
    currentWaiting: 0,
    lastActivityAt: null,
    hasActivity: false,
  };
}

interface TeamAggregate {
  teamId: number;
  conversations: bigint | number | string;
  open: bigint | number | string;
  pending: bigint | number | string;
  resolved: bigint | number | string;
  replied: bigint | number | string;
  needsReply: bigint | number | string;
  unread: bigint | number | string;
  activeMembers: bigint | number | string;
  responseCount: bigint | number | string;
  responseTotal: bigint | number | string;
  avgResponseSeconds: number | string | null;
  medianResponseSeconds: number | string | null;
  maxResponseSeconds: number | string | null;
  avgResolutionSeconds: number | string | null;
  slaBreaches: bigint | number | string;
  campaignReplies: bigint | number | string;
  botHandoffs: bigint | number | string;
  lastActivityAt: Date | null;
}

interface AttributionAggregate {
  source: string;
  count: bigint | number | string;
}

interface TeamMemberAggregate {
  agentId: number | null;
  fallbackName: string | null;
  assigned: bigint | number | string;
  replied: bigint | number | string;
  needsReply: bigint | number | string;
  open: bigint | number | string;
  resolved: bigint | number | string;
  avgResponseSeconds: number | string | null;
  medianResponseSeconds: number | string | null;
  maxResponseSeconds: number | string | null;
  slaBreaches: bigint | number | string;
  lastActivityAt: Date | null;
}

interface TeamConversationListRow {
  chatwootId: number;
  displayId: number | null;
  contactName: string | null;
  contactPhone: string | null;
  status: string | null;
  department: string | null;
  inboxName: string | null;
  assigneeName: string | null;
  assigneeCwId: number | null;
  needsReply: boolean;
  responseSeconds: number | null;
  conversationDurationSeconds: number | null;
  campaignLabel: string | null;
  botInvolved: boolean;
  slaFirstResponseBreached: boolean;
  lastMessageAt: Date | null;
  createdAtCw: Date | null;
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

/** Which teams an agent belongs to — for the agent detail screen. */
export async function getAgentTeams(agentId: number): Promise<TeamRecord[]> {
  const rows = await prisma.teamMembership.findMany({
    where: { agentCwId: agentId },
    select: { team: { select: { id: true, name: true, department: true } } },
  });
  return rows.map((r) => r.team);
}
