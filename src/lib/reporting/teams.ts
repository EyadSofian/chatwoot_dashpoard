import { prisma } from "@/lib/db";
import { average, median } from "@/lib/format";
import {
  resolveConversationTeam,
  membershipIndex,
  membersByTeam,
  type TeamAttributionSource,
} from "@/lib/metrics/teamAttribution";
import { conversationWhere, type ReportFilters } from "./filters";

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
  lastActivityAt: Date | null;
  hasActivity: boolean;
}

export interface TeamsSummary {
  totalTeams: number;
  activeTeams: number;
  /** Live total across teams. */
  currentWorkload: number;
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
  // The team filter must not shrink the roster — it narrows the conversations,
  // and the caller still expects to see every team.
  const where = conversationWhere(f);

  const [teams, memberships, conversations, live] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true, department: true } }),
    prisma.teamMembership.findMany({ select: { teamCwId: true, agentCwId: true } }),
    prisma.conversation.findMany({ where, select: CONVERSATION_SELECT, take: 40000 }),
    // Live workload: active statuses, every other filter applied, NO date bound.
    prisma.conversation.groupBy({
      by: ["teamCwId"],
      where: {
        ...conversationWhere(f, { ignoreDate: true }),
        status: { in: ["open", "pending", "snoozed"] },
        teamCwId: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const currentByTeam = new Map<number, number>();
  for (const g of live) if (g.teamCwId !== null) currentByTeam.set(g.teamCwId, g._count._all);

  const assignmentTeamByConversation = await assignmentTeams(conversations);

  return buildTeamsReport({
    teams,
    memberships,
    conversations,
    activeOnly: f.activeOnly,
    assignmentTeamByConversation,
    currentByTeam,
  });
}

/** One team: its row, its members, and how it trended. */
export async function getTeamDetail(teamId: number, f: ReportFilters) {
  const [team, memberships, allTeams, agents] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId } }),
    prisma.teamMembership.findMany({ select: { teamCwId: true, agentCwId: true } }),
    prisma.team.findMany({ select: { id: true, name: true, department: true } }),
    prisma.agent.findMany({ select: { id: true, name: true, email: true, availability: true } }),
  ]);

  const conversations = await teamConversationRows(teamId, f, memberships, allTeams);

  const report = buildTeamsReport({
    teams: allTeams,
    memberships,
    conversations,
    assignmentTeamByConversation: new Map(),
  });
  const row = report.rows.find((r) => r.teamCwId === teamId) ?? null;

  const memberIds = membersByTeam(memberships).get(teamId) ?? [];
  const members = buildTeamMembers({
    memberIds,
    agents,
    conversations,
    activeOnly: f.activeOnly,
  });

  return { team, row, members, conversationCount: conversations.length };
}

/**
 * The conversations that belong to one team, under the same attribution rules
 * the leaderboard uses — so a team's drill-down always matches its row.
 */
async function teamConversationRows(
  teamId: number,
  f: ReportFilters,
  memberships: { teamCwId: number; agentCwId: number }[],
  _teams: TeamRecord[],
): Promise<TeamConversation[]> {
  const byAgent = membershipIndex(memberships);
  const soleMembers = [...byAgent.entries()]
    .filter(([, teams]) => teams.length === 1 && teams[0] === teamId)
    .map(([agentId]) => agentId);

  const where = conversationWhere({ ...f, teamId: undefined });

  // Direct hits, plus the ones with no team whose assignee belongs only here.
  const candidates = await prisma.conversation.findMany({
    where: {
      ...where,
      OR: [
        { teamCwId: teamId },
        ...(soleMembers.length ? [{ teamCwId: null, assigneeCwId: { in: soleMembers } }] : []),
      ],
    },
    select: CONVERSATION_SELECT,
    take: 40000,
  });

  return candidates;
}

export async function getTeamMembers(teamId: number, f: ReportFilters): Promise<TeamMemberRow[]> {
  const [memberships, agents, teams] = await Promise.all([
    prisma.teamMembership.findMany({ select: { teamCwId: true, agentCwId: true } }),
    prisma.agent.findMany({ select: { id: true, name: true, email: true, availability: true } }),
    prisma.team.findMany({ select: { id: true, name: true, department: true } }),
  ]);
  const conversations = await teamConversationRows(teamId, f, memberships, teams);
  const memberIds = membersByTeam(memberships).get(teamId) ?? [];

  return buildTeamMembers({ memberIds, agents, conversations, activeOnly: f.activeOnly });
}

/** Paginated conversation list for a team (optionally one member of it). */
export async function getTeamConversations(
  teamId: number,
  f: ReportFilters,
  page = 1,
  pageSize = 50,
) {
  const memberships = await prisma.teamMembership.findMany({ select: { teamCwId: true, agentCwId: true } });
  const byAgent = membershipIndex(memberships);
  const soleMembers = [...byAgent.entries()]
    .filter(([, teams]) => teams.length === 1 && teams[0] === teamId)
    .map(([agentId]) => agentId);

  const base = conversationWhere({ ...f, teamId: undefined });
  const where = {
    ...base,
    OR: [
      { teamCwId: teamId },
      ...(soleMembers.length ? [{ teamCwId: null, assigneeCwId: { in: soleMembers } }] : []),
    ],
  };

  const size = Math.min(Math.max(pageSize, 1), 200);
  const skip = (Math.max(page, 1) - 1) * size;

  const [total, rows] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip,
      take: size,
      select: {
        chatwootId: true,
        contactName: true,
        contactPhone: true,
        status: true,
        department: true,
        inboxName: true,
        assigneeName: true,
        assigneeCwId: true,
        needsReply: true,
        responseSeconds: true,
        conversationDurationSeconds: true,
        campaignLabel: true,
        botInvolved: true,
        slaFirstResponseBreached: true,
        lastMessageAt: true,
        createdAtCw: true,
      },
    }),
  ]);

  return { rows, total, page: Math.max(page, 1), pageSize: size, pages: Math.ceil(total / size) };
}

/** Which teams an agent belongs to — for the agent detail screen. */
export async function getAgentTeams(agentId: number): Promise<TeamRecord[]> {
  const rows = await prisma.teamMembership.findMany({
    where: { agentCwId: agentId },
    select: { team: { select: { id: true, name: true, department: true } } },
  });
  return rows.map((r) => r.team);
}
