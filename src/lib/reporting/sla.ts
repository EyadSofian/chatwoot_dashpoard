import { prisma } from "@/lib/db";
import { conversationWhere, type ReportFilters } from "./filters";

export interface SlaResult {
  firstResponse: { breached: number; nearBreach: number; healthy: number };
  resolution: { breached: number; nearBreach: number; healthy: number };
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
  const rows = await prisma.conversation.findMany({
    where,
    select: {
      chatwootId: true,
      contactName: true,
      assigneeName: true,
      department: true,
      status: true,
      responseSeconds: true,
      assignedAt: true,
      createdAtCw: true,
      slaFirstResponseState: true,
      slaResolutionState: true,
    },
    take: 40000,
  });

  const fr = { breached: 0, nearBreach: 0, healthy: 0 };
  const res = { breached: 0, nearBreach: 0, healthy: 0 };
  for (const r of rows) {
    if (r.slaFirstResponseState === "breached") fr.breached++;
    else if (r.slaFirstResponseState === "near_breach") fr.nearBreach++;
    else fr.healthy++;
    if (r.slaResolutionState === "breached") res.breached++;
    else if (r.slaResolutionState === "near_breach") res.nearBreach++;
    else res.healthy++;
  }

  const now = Date.now();
  const breachedList = rows
    .filter((r) => r.slaFirstResponseState === "breached")
    .map((r) => ({
      chatwootId: r.chatwootId,
      contactName: r.contactName,
      assigneeName: r.assigneeName,
      department: r.department,
      responseSeconds: r.responseSeconds,
      status: r.status,
    }))
    .sort((a, b) => (b.responseSeconds ?? 0) - (a.responseSeconds ?? 0))
    .slice(0, 25);

  const nearBreachList = rows
    .filter((r) => r.slaFirstResponseState === "near_breach" && r.status !== "resolved")
    .map((r) => {
      const base = r.assignedAt ?? r.createdAtCw;
      return {
        chatwootId: r.chatwootId,
        contactName: r.contactName,
        assigneeName: r.assigneeName,
        department: r.department,
        waitingSeconds: base ? Math.round((now - base.getTime()) / 1000) : null,
      };
    })
    .sort((a, b) => (b.waitingSeconds ?? 0) - (a.waitingSeconds ?? 0))
    .slice(0, 25);

  return { firstResponse: fr, resolution: res, breachedList, nearBreachList };
}
