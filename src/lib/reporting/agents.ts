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
}

export async function getAgentLeaderboard(f: ReportFilters): Promise<AgentRow[]> {
  const where = conversationWhere(f);
  const rows = await prisma.conversation.findMany({
    where: { ...where, assigneeCwId: { not: null } },
    select: {
      assigneeCwId: true,
      assigneeName: true,
      status: true,
      needsReply: true,
      handledByHuman: true,
      unreadCount: true,
      responseSeconds: true,
      slaFirstResponseBreached: true,
    },
    take: 40000,
  });

  const agents = await prisma.agent.findMany();
  const agentInfo = new Map(agents.map((a) => [a.id, a]));

  const map = new Map<number, AgentRow & { _resp: number[] }>();
  for (const r of rows) {
    if (r.assigneeCwId === null) continue;
    const info = agentInfo.get(r.assigneeCwId);
    const row =
      map.get(r.assigneeCwId) ??
      ({
        agentId: r.assigneeCwId,
        name: info?.name ?? r.assigneeName ?? `#${r.assigneeCwId}`,
        email: info?.email ?? null,
        availability: info?.availability ?? null,
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
        _resp: [],
      } as AgentRow & { _resp: number[] });

    row.assigned++;
    if (r.handledByHuman) row.replied++;
    if (r.needsReply) row.needsReply++;
    if (r.status === "open") row.open++;
    if (r.status === "resolved") row.resolved++;
    if (r.status === "pending") row.pending++;
    if (r.unreadCount > 0) row.unread++;
    if (r.slaFirstResponseBreached) row.slaBreaches++;
    if (r.responseSeconds !== null) row._resp.push(r.responseSeconds);
    map.set(r.assigneeCwId, row);
  }

  return [...map.values()]
    .map(({ _resp, ...row }) => ({
      ...row,
      avgResponseSeconds: average(_resp),
      medianResponseSeconds: median(_resp),
      maxResponseSeconds: _resp.length ? Math.max(..._resp) : null,
    }))
    .sort((a, b) => b.assigned - a.assigned);
}

export async function getAgentDetail(agentId: number, f: ReportFilters) {
  const where = conversationWhere(f);
  const [agent, leaderboard, conversations] = await Promise.all([
    prisma.agent.findUnique({ where: { id: agentId } }),
    getAgentLeaderboard({ ...f, agentId }),
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

  const summary = leaderboard.find((a) => a.agentId === agentId) ?? null;
  return { agent, summary, conversations };
}
