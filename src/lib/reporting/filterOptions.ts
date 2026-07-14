import { prisma } from "@/lib/db";
import { DEPARTMENTS } from "@/lib/constants";

export interface FilterOptions {
  agents: { id: number; name: string }[];
  teams: { id: number; name: string; department: string | null }[];
  inboxes: { id: number; name: string }[];
  campaignLabels: string[];
  departments: string[];
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const [agents, teams, inboxes, labels] = await Promise.all([
    prisma.agent.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, department: true } }),
    prisma.inbox.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.conversation.findMany({
      where: { campaignLabel: { not: null } },
      distinct: ["campaignLabel"],
      select: { campaignLabel: true },
      take: 500,
    }),
  ]);

  return {
    agents: agents.map((a) => ({ id: a.id, name: a.name ?? `#${a.id}` })),
    teams: teams.map((t) => ({ id: t.id, name: t.name ?? `#${t.id}`, department: t.department })),
    inboxes: inboxes.map((i) => ({ id: i.id, name: i.name ?? `#${i.id}` })),
    campaignLabels: labels.map((l) => l.campaignLabel).filter((l): l is string => Boolean(l)).sort(),
    departments: [...DEPARTMENTS],
  };
}
