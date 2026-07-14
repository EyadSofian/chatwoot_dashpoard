import { prisma } from "@/lib/db";
import { DEPARTMENTS } from "@/lib/constants";
import { getMetadataSyncState } from "@/lib/ingest/entities";

export interface FilterOptions {
  agents: { id: number; name: string }[];
  teams: { id: number; name: string; department: string | null }[];
  inboxes: { id: number; name: string }[];
  campaignLabels: string[];
  labels: { title: string; color: string | null }[];
  departments: string[];
  /** Never synced ⇒ the agent/team rosters are empty and the UI must say so. */
  metadata: { synced: boolean; lastSyncAt: string | null; agents: number; teams: number };
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const [agents, teams, inboxes, campaignLabels, labels, metadata] = await Promise.all([
    prisma.agent.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, department: true } }),
    prisma.inbox.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.conversation.findMany({
      where: { campaignLabel: { not: null } },
      distinct: ["campaignLabel"],
      select: { campaignLabel: true },
      take: 500,
    }),
    prisma.label.findMany({ orderBy: { title: "asc" }, select: { title: true, color: true } }),
    getMetadataSyncState(),
  ]);

  return {
    agents: agents.map((a) => ({ id: a.id, name: a.name ?? `#${a.id}` })),
    teams: teams.map((t) => ({ id: t.id, name: t.name ?? `#${t.id}`, department: t.department })),
    inboxes: inboxes.map((i) => ({ id: i.id, name: i.name ?? `#${i.id}` })),
    campaignLabels: campaignLabels.map((l) => l.campaignLabel).filter((l): l is string => Boolean(l)).sort(),
    labels: labels.map((l) => ({ title: l.title, color: l.color })),
    departments: [...DEPARTMENTS],
    metadata: {
      synced: metadata.synced,
      lastSyncAt: metadata.lastSyncAt,
      agents: metadata.agents,
      teams: metadata.teams,
    },
  };
}
