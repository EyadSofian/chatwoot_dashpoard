import { prisma } from "@/lib/db";
import { env } from "@/env";
import { ChatwootClient, getPayload } from "@/lib/chatwoot/client";
import { normalizeDepartmentText } from "@/lib/metrics/department";
import type { CwAgent, CwInbox, CwLabel, CwTeam } from "@/lib/chatwoot/types";

export const METADATA_SYNC_KEY = "chatwoot_metadata_sync";

export interface MetadataSyncState {
  lastSyncAt: string | null;
  agents: number;
  teams: number;
  inboxes: number;
  memberships: number;
  labels: number;
}

export interface SyncOptions {
  agents?: boolean;
  teams?: boolean;
  inboxes?: boolean;
  labels?: boolean;
}

function teamDepartment(team: CwTeam): string {
  const id = String(team.id);
  if (id === env.salesTeamId()) return "sales";
  if (id === env.operationsTeamId()) return "operations";
  if (id === env.complaintsTeamId()) return "complaints";
  return normalizeDepartmentText(team.name || "") ?? "unknown";
}

async function syncAgents(client: ChatwootClient): Promise<number> {
  const res = await client.listAgents().catch(() => [] as CwAgent[]);
  const agents = (Array.isArray(res) ? res : getPayload<CwAgent>(res)) as CwAgent[];

  for (const a of agents) {
    if (typeof a.id !== "number") continue;
    const data = {
      name: a.name ?? a.available_name ?? null,
      email: a.email ?? null,
      role: a.role ?? null,
      availability: a.availability_status ?? null,
      thumbnail: a.thumbnail ?? null,
      confirmed: a.confirmed !== false,
    };
    await prisma.agent.upsert({ where: { id: a.id }, create: { id: a.id, ...data }, update: data });
  }
  return agents.length;
}

async function syncInboxes(client: ChatwootClient): Promise<number> {
  const res = await client.listInboxes().catch(() => ({ payload: [] as CwInbox[] }));
  const inboxes = getPayload<CwInbox>(res);

  for (const i of inboxes) {
    if (typeof i.id !== "number") continue;
    const data = {
      name: i.name ?? null,
      channelType: i.channel_type ?? null,
      department: normalizeDepartmentText(i.name || "") ?? null,
    };
    await prisma.inbox.upsert({ where: { id: i.id }, create: { id: i.id, ...data }, update: data });
  }
  return inboxes.length;
}

/**
 * Teams AND their members. The membership table is what lets the Teams screen
 * list every member of a team, including the ones who handled nothing this
 * period — the roster has to exist independently of the metrics.
 */
async function syncTeams(client: ChatwootClient): Promise<{ teams: number; memberships: number }> {
  const res = await client.listTeams().catch(() => [] as CwTeam[]);
  const teams = (Array.isArray(res) ? res : getPayload<CwTeam>(res)) as CwTeam[];

  let memberships = 0;

  for (const t of teams) {
    if (typeof t.id !== "number") continue;
    const data = { name: t.name ?? null, department: teamDepartment(t) };
    await prisma.team.upsert({ where: { id: t.id }, create: { id: t.id, ...data }, update: data });

    const membersRes = await client.teamMembers(t.id).catch(() => [] as CwAgent[]);
    const members = (Array.isArray(membersRes) ? membersRes : getPayload<CwAgent>(membersRes)) as CwAgent[];

    const memberIds: number[] = [];
    for (const m of members) {
      if (typeof m.id !== "number") continue;
      memberIds.push(m.id);

      // The member may not be in `agents` yet (fresh account, or agents synced
      // after teams) — make sure the FK has something to point at.
      await prisma.agent.upsert({
        where: { id: m.id },
        create: {
          id: m.id,
          name: m.name ?? m.available_name ?? null,
          email: m.email ?? null,
          role: m.role ?? null,
          availability: m.availability_status ?? null,
        },
        update: {},
      });

      await prisma.teamMembership.upsert({
        where: { teamCwId_agentCwId: { teamCwId: t.id, agentCwId: m.id } },
        create: { teamCwId: t.id, agentCwId: m.id },
        update: {},
      });
      memberships++;
    }

    // Drop members who left the team in Chatwoot, so the roster stays truthful.
    await prisma.teamMembership.deleteMany({
      where: { teamCwId: t.id, ...(memberIds.length ? { agentCwId: { notIn: memberIds } } : {}) },
    });
  }

  return { teams: teams.length, memberships };
}

/**
 * Labels. Conversations store label TITLES, so this roster is what lets a label
 * with no traffic in the window still appear — same rule as agents and teams.
 */
async function syncLabels(client: ChatwootClient): Promise<number> {
  const res = await client.listLabels().catch(() => ({ payload: [] as CwLabel[] }));
  const labels = getPayload<CwLabel>(res);

  for (const l of labels) {
    if (typeof l.id !== "number" || !l.title) continue;
    const data = {
      title: l.title,
      description: l.description ?? null,
      color: l.color ?? null,
      showOnSidebar: l.show_on_sidebar !== false,
    };
    await prisma.label.upsert({ where: { id: l.id }, create: { id: l.id, ...data }, update: data });
  }
  return labels.length;
}

/** Sync Chatwoot metadata (agents, teams + members, inboxes, labels) into the local tables. */
export async function syncEntities(
  client: ChatwootClient,
  opts: SyncOptions = {},
): Promise<MetadataSyncState> {
  const all = !opts.agents && !opts.teams && !opts.inboxes && !opts.labels;

  const agents = all || opts.agents ? await syncAgents(client) : 0;
  const inboxes = all || opts.inboxes ? await syncInboxes(client) : 0;
  const labels = all || opts.labels ? await syncLabels(client) : 0;
  const teamResult = all || opts.teams ? await syncTeams(client) : { teams: 0, memberships: 0 };

  const state: MetadataSyncState = {
    lastSyncAt: new Date().toISOString(),
    agents,
    teams: teamResult.teams,
    inboxes,
    memberships: teamResult.memberships,
    labels,
  };

  await prisma.appSetting.upsert({
    where: { key: METADATA_SYNC_KEY },
    create: { key: METADATA_SYNC_KEY, value: state as unknown as object },
    update: { value: state as unknown as object },
  });

  return state;
}

/** Has Chatwoot metadata ever been synced? Drives the "sync first" warning. */
export async function getMetadataSyncState(): Promise<MetadataSyncState & { synced: boolean }> {
  const [row, agents, teams, labels] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: METADATA_SYNC_KEY } }).catch(() => null),
    prisma.agent.count().catch(() => 0),
    prisma.team.count().catch(() => 0),
    prisma.label.count().catch(() => 0),
  ]);

  const saved = (row?.value ?? null) as MetadataSyncState | null;
  return {
    lastSyncAt: saved?.lastSyncAt ?? null,
    agents,
    teams,
    labels,
    inboxes: saved?.inboxes ?? 0,
    memberships: saved?.memberships ?? 0,
    // Rows in the tables count as synced even if the marker predates this build.
    synced: Boolean(saved?.lastSyncAt) || agents > 0 || teams > 0,
  };
}
