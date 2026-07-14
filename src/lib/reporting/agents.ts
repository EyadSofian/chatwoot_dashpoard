import { prisma } from "@/lib/db";
import { average, median } from "@/lib/format";
import { conversationWhere, type ReportFilters } from "./filters";

export interface AgentRow {
  agentId: number;
  name: string;
  email: string | null;
  availability: string | null;
  assigned: number;
  replied: number;
  needsReply: number;
  open: number;
  resolved: number;
  pending: number;
  unread: number;
  avgResponseSeconds: number | null;
  medianResponseSeconds: number | null;
  maxResponseSeconds: number | null;
  slaBreaches: number;
  /** Had at least one conversation assigned in the selected period. */
  hasActivity: boolean;
}

export interface AgentSummary {
  totalAgents: number;
  activeAgents: number;
  avgResponseSeconds: number | null;
  slaBreaches: number;
}

export interface AgentLeaderboard {
  rows: AgentRow[];
  summary: AgentSummary;
}

/** The agent roster, straight from the local `agents` table (synced from Chatwoot). */
export interface AgentRecord {
  id: number;
  name: string | null;
  email: string | null;
  availability: string | null;
}

/** A conversation, reduced to what the leaderboard counts. */
export interface AgentConversation {
  assigneeCwId: number | null;
  assigneeName: string | null;
  status: string | null;
  needsReply: boolean;
  handledByHuman: boolean;
  unreadCount: number;
  slaFirstResponseBreached: boolean;
}

/**
 * One assignment → first-human-reply interval. This is the response-time source:
 * `responseSeconds` is measured from the moment the conversation was assigned to
 * THIS agent until their first public outgoing human message (private notes,
 * Fahd/Botpress, automation rules, campaign templates and activity messages are
 * already excluded upstream by the message classifier). Using intervals rather
 * than the conversation's own responseSeconds means a reassigned conversation
 * credits the agent who actually answered, not whoever holds it now.
 */
export interface AgentInterval {
  assigneeCwId: number;
  responseSeconds: number | null;
  responded: boolean;
}

function emptyRow(agentId: number, info: Partial<AgentRecord> & { fallbackName?: string | null }): AgentRow {
  return {
    agentId,
    name: info.name || info.fallbackName || `#${agentId}`,
    email: info.email ?? null,
    availability: info.availability ?? null,
    assigned: 0,
    replied: 0,
    needsReply: 0,
    open: 0,
    resolved: 0,
    pending: 0,
    unread: 0,
    avgResponseSeconds: null,
    medianResponseSeconds: null,
    maxResponseSeconds: null,
    slaBreaches: 0,
    hasActivity: false,
  };
}

/**
 * Merge period metrics onto the FULL agent roster — a left join, in memory.
 *
 * Every agent in the roster appears, whether or not they touched a conversation
 * in the window; a quiet agent is a real answer ("zero"), not an absent row.
 * Assignees seen in the data but missing from the roster are still included, so
 * an unsynced or since-deleted agent never silently drops their numbers.
 */
export function buildAgentLeaderboard(input: {
  agents: AgentRecord[];
  conversations: AgentConversation[];
  intervals: AgentInterval[];
  activeOnly?: boolean;
}): AgentLeaderboard {
  const { agents, conversations, intervals, activeOnly = false } = input;

  const rows = new Map<number, AgentRow>();
  const responses = new Map<number, number[]>();

  // 1. Seed from the roster — this is what makes zero-activity agents visible.
  for (const a of agents) {
    rows.set(a.id, emptyRow(a.id, a));
  }

  // 2. Fold in the period's conversations.
  for (const c of conversations) {
    if (c.assigneeCwId === null) continue;
    let row = rows.get(c.assigneeCwId);
    if (!row) {
      row = emptyRow(c.assigneeCwId, { fallbackName: c.assigneeName });
      rows.set(c.assigneeCwId, row);
    }

    row.assigned++;
    row.hasActivity = true;
    if (c.handledByHuman) row.replied++;
    if (c.needsReply) row.needsReply++;
    if (c.status === "open") row.open++;
    if (c.status === "resolved") row.resolved++;
    if (c.status === "pending") row.pending++;
    if (c.unreadCount > 0) row.unread++;
    if (c.slaFirstResponseBreached) row.slaBreaches++;
  }

  // 3. Response times come from the assignment intervals, not the conversations.
  for (const i of intervals) {
    if (!i.responded || i.responseSeconds === null) continue;
    if (!rows.has(i.assigneeCwId)) rows.set(i.assigneeCwId, emptyRow(i.assigneeCwId, {}));
    const list = responses.get(i.assigneeCwId) ?? [];
    list.push(i.responseSeconds);
    responses.set(i.assigneeCwId, list);
  }

  for (const [agentId, list] of responses) {
    const row = rows.get(agentId)!;
    row.avgResponseSeconds = average(list);
    row.medianResponseSeconds = median(list);
    row.maxResponseSeconds = list.length ? Math.max(...list) : null;
  }

  const all = [...rows.values()];

  // Summary describes the whole roster, so it does not shift when the viewer
  // flips "active only" — that toggle hides rows, it does not change the truth.
  const pooled = [...responses.values()].flat();
  const summary: AgentSummary = {
    totalAgents: all.length,
    activeAgents: all.filter((r) => r.hasActivity).length,
    avgResponseSeconds: average(pooled),
    slaBreaches: all.reduce((sum, r) => sum + r.slaBreaches, 0),
  };

  const visible = activeOnly ? all.filter((r) => r.hasActivity) : all;

  // Busiest first; quiet agents fall to the bottom in a stable, alphabetical order.
  visible.sort((a, b) => {
    if (a.hasActivity !== b.hasActivity) return a.hasActivity ? -1 : 1;
    if (b.assigned !== a.assigned) return b.assigned - a.assigned;
    return a.name.localeCompare(b.name, "ar");
  });

  return { rows: visible, summary };
}

export async function getAgentLeaderboard(f: ReportFilters): Promise<AgentLeaderboard> {
  const where = conversationWhere(f);

  // When drilling into one agent, the roster is just that agent.
  const agentWhere = f.agentId !== undefined ? { id: f.agentId } : {};

  const [agents, conversations, intervals] = await Promise.all([
    prisma.agent.findMany({
      where: agentWhere,
      select: { id: true, name: true, email: true, availability: true },
    }),
    prisma.conversation.findMany({
      where: { ...where, assigneeCwId: { not: null } },
      select: {
        assigneeCwId: true,
        assigneeName: true,
        status: true,
        needsReply: true,
        handledByHuman: true,
        unreadCount: true,
        slaFirstResponseBreached: true,
      },
      take: 40000,
    }),
    prisma.assignmentInterval.findMany({
      where: {
        startedAt: { gte: f.from, lte: f.to },
        responded: true,
        ...(f.agentId !== undefined ? { assigneeCwId: f.agentId } : {}),
      },
      select: { assigneeCwId: true, responseSeconds: true, responded: true },
      take: 100000,
    }),
  ]);

  return buildAgentLeaderboard({
    agents,
    conversations,
    intervals,
    activeOnly: f.activeOnly,
  });
}

export async function getAgentDetail(agentId: number, f: ReportFilters) {
  const where = conversationWhere(f);
  const [agent, board, conversations] = await Promise.all([
    prisma.agent.findUnique({ where: { id: agentId } }),
    getAgentLeaderboard({ ...f, agentId, activeOnly: false }),
    prisma.conversation.findMany({
      where: { ...where, assigneeCwId: agentId },
      orderBy: { lastMessageAt: "desc" },
      take: 500,
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
        slaFirstResponseBreached: true,
      },
    }),
  ]);

  const summary = board.rows.find((a) => a.agentId === agentId) ?? null;
  return { agent, summary, conversations };
}
