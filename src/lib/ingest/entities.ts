import { prisma } from "@/lib/db";
import { env } from "@/env";
import { ChatwootClient, getPayload } from "@/lib/chatwoot/client";
import { normalizeDepartmentText } from "@/lib/metrics/department";
import type { CwAgent, CwInbox, CwTeam } from "@/lib/chatwoot/types";

function teamDepartment(team: CwTeam): string {
  const id = String(team.id);
  if (id === env.salesTeamId()) return "sales";
  if (id === env.operationsTeamId()) return "operations";
  if (id === env.complaintsTeamId()) return "complaints";
  return normalizeDepartmentText(team.name || "") ?? "unknown";
}

/** Sync agents, teams and inboxes from Chatwoot into the local tables. */
export async function syncEntities(client: ChatwootClient): Promise<{ agents: number; teams: number; inboxes: number }> {
  const [agentsRes, teamsRes, inboxesRes] = await Promise.all([
    client.listAgents().catch(() => [] as CwAgent[]),
    client.listTeams().catch(() => [] as CwTeam[]),
    client.listInboxes().catch(() => ({ payload: [] as CwInbox[] })),
  ]);

  const agents = (Array.isArray(agentsRes) ? agentsRes : getPayload<CwAgent>(agentsRes)) as CwAgent[];
  const teams = (Array.isArray(teamsRes) ? teamsRes : getPayload<CwTeam>(teamsRes)) as CwTeam[];
  const inboxes = getPayload<CwInbox>(inboxesRes);

  for (const a of agents) {
    if (typeof a.id !== "number") continue;
    await prisma.agent.upsert({
      where: { id: a.id },
      create: {
        id: a.id,
        name: a.name ?? a.available_name ?? null,
        email: a.email ?? null,
        role: a.role ?? null,
        availability: a.availability_status ?? null,
        thumbnail: a.thumbnail ?? null,
        confirmed: a.confirmed !== false,
      },
      update: {
        name: a.name ?? a.available_name ?? null,
        email: a.email ?? null,
        role: a.role ?? null,
        availability: a.availability_status ?? null,
        thumbnail: a.thumbnail ?? null,
        confirmed: a.confirmed !== false,
      },
    });
  }

  for (const t of teams) {
    if (typeof t.id !== "number") continue;
    await prisma.team.upsert({
      where: { id: t.id },
      create: { id: t.id, name: t.name ?? null, department: teamDepartment(t) },
      update: { name: t.name ?? null, department: teamDepartment(t) },
    });
  }

  for (const i of inboxes) {
    if (typeof i.id !== "number") continue;
    await prisma.inbox.upsert({
      where: { id: i.id },
      create: {
        id: i.id,
        name: i.name ?? null,
        channelType: i.channel_type ?? null,
        department: normalizeDepartmentText(i.name || "") ?? null,
      },
      update: {
        name: i.name ?? null,
        channelType: i.channel_type ?? null,
        department: normalizeDepartmentText(i.name || "") ?? null,
      },
    });
  }

  return { agents: agents.length, teams: teams.length, inboxes: inboxes.length };
}
