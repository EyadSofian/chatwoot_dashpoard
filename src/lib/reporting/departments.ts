import { prisma } from "@/lib/db";
import { average } from "@/lib/format";
import { DEPARTMENTS, type Department } from "@/lib/constants";
import { conversationWhere, type ReportFilters } from "./filters";

export interface DepartmentRow {
  department: Department;
  volume: number;
  avgResponseSeconds: number | null;
  avgResolutionSeconds: number | null;
  open: number;
  unresolved: number;
  slaBreaches: number;
}

export interface DepartmentsResult {
  rows: DepartmentRow[];
  topDelayed: {
    chatwootId: number;
    contactName: string | null;
    department: string | null;
    assigneeName: string | null;
    waitingSeconds: number | null;
  }[];
}

export async function getDepartments(f: ReportFilters): Promise<DepartmentsResult> {
  const where = conversationWhere({ ...f, department: undefined });
  const rows = await prisma.conversation.findMany({
    where,
    select: {
      chatwootId: true,
      department: true,
      status: true,
      needsReply: true,
      assigneeName: true,
      assignedAt: true,
      createdAtCw: true,
      contactName: true,
      responseSeconds: true,
      conversationDurationSeconds: true,
      slaFirstResponseBreached: true,
    },
    take: 40000,
  });

  const buckets = new Map<string, { resp: number[]; res: number[]; volume: number; open: number; unresolved: number; sla: number }>();
  for (const dep of DEPARTMENTS) buckets.set(dep, { resp: [], res: [], volume: 0, open: 0, unresolved: 0, sla: 0 });

  for (const r of rows) {
    const dep = (r.department as Department) ?? "unknown";
    const b = buckets.get(dep) ?? buckets.get("unknown")!;
    b.volume++;
    if (r.status === "open") b.open++;
    if (r.status !== "resolved") b.unresolved++;
    if (r.slaFirstResponseBreached) b.sla++;
    if (r.responseSeconds !== null) b.resp.push(r.responseSeconds);
    if (r.conversationDurationSeconds !== null) b.res.push(r.conversationDurationSeconds);
  }

  const result: DepartmentRow[] = DEPARTMENTS.map((department) => {
    const b = buckets.get(department)!;
    return {
      department,
      volume: b.volume,
      avgResponseSeconds: average(b.resp),
      avgResolutionSeconds: average(b.res),
      open: b.open,
      unresolved: b.unresolved,
      slaBreaches: b.sla,
    };
  });

  const now = Date.now();
  const topDelayed = rows
    .filter((r) => r.status !== "resolved" && r.needsReply)
    .map((r) => {
      const base = r.assignedAt ?? r.createdAtCw;
      return {
        chatwootId: r.chatwootId,
        contactName: r.contactName,
        department: r.department,
        assigneeName: r.assigneeName,
        waitingSeconds: base ? Math.round((now - base.getTime()) / 1000) : null,
      };
    })
    .sort((a, b) => (b.waitingSeconds ?? 0) - (a.waitingSeconds ?? 0))
    .slice(0, 15);

  return { rows: result, topDelayed };
}
