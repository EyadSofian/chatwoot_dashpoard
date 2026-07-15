import { prisma } from "@/lib/db";
import { conversationWhere, type ReportFilters } from "./filters";

export interface SlaResult {
  firstResponse: { breached: number; nearBreach: number; healthy: number; unknown: number };
  resolution: { breached: number; nearBreach: number; healthy: number; unknown: number };
  breachedList: {
    chatwootId: number;
    contactName: string | null;
    assigneeName: string | null;
    department: string | null;
    responseSeconds: number | null;
    status: string | null;
  }[];
  nearBreachList: {
    chatwootId: number;
    contactName: string | null;
    assigneeName: string | null;
    department: string | null;
    waitingSeconds: number | null;
  }[];
}

export async function getSla(f: ReportFilters): Promise<SlaResult> {
  const where = conversationWhere(f);
  const activeStatuses = ["open", "pending", "snoozed"].filter(
    (status) => !f.status?.length || f.status.includes(status),
  );
  const [firstGroups, resolutionGroups, breachedList, nearRows] = await Promise.all([
    prisma.conversation.groupBy({
      by: ["slaFirstResponseState"],
      where,
      _count: { _all: true },
    }),
    prisma.conversation.groupBy({
      by: ["slaResolutionState"],
      where,
      _count: { _all: true },
    }),
    prisma.conversation.findMany({
      where: { ...where, slaFirstResponseState: "breached" },
      orderBy: [{ responseSeconds: "desc" }, { chatwootId: "desc" }],
      take: 25,
      select: {
        chatwootId: true,
        contactName: true,
        assigneeName: true,
        department: true,
        responseSeconds: true,
        status: true,
      },
    }),
    activeStatuses.length
      ? prisma.conversation.findMany({
          where: {
            ...where,
            slaFirstResponseState: "near_breach",
            status: { in: activeStatuses },
          },
          orderBy: [{ assignedAt: "asc" }, { createdAtCw: "asc" }],
          take: 25,
          select: {
            chatwootId: true,
            contactName: true,
            assigneeName: true,
            department: true,
            assignedAt: true,
            createdAtCw: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const fr = { breached: 0, nearBreach: 0, healthy: 0, unknown: 0 };
  for (const group of firstGroups) {
    if (group.slaFirstResponseState === "breached") fr.breached = group._count._all;
    else if (group.slaFirstResponseState === "near_breach") fr.nearBreach = group._count._all;
    else if (group.slaFirstResponseState === "healthy") fr.healthy = group._count._all;
    else fr.unknown += group._count._all;
  }
  const res = { breached: 0, nearBreach: 0, healthy: 0, unknown: 0 };
  for (const group of resolutionGroups) {
    if (group.slaResolutionState === "breached") res.breached = group._count._all;
    else if (group.slaResolutionState === "near_breach") res.nearBreach = group._count._all;
    else if (group.slaResolutionState === "healthy") res.healthy = group._count._all;
    else res.unknown += group._count._all;
  }

  const now = Date.now();
  const nearBreachList = nearRows.map((row) => {
    const base = row.assignedAt ?? row.createdAtCw;
    return {
      chatwootId: row.chatwootId,
      contactName: row.contactName,
      assigneeName: row.assigneeName,
      department: row.department,
      waitingSeconds: base ? Math.max(0, Math.round((now - base.getTime()) / 1000)) : null,
    };
  });

  return { firstResponse: fr, resolution: res, breachedList, nearBreachList };
}
