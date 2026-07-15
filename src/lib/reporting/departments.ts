import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEPARTMENTS, type Department } from "@/lib/constants";
import { conversationWhere, type ReportFilters } from "./filters";
import { andSql, conversationSqlConditions } from "./sqlFilters";

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
  const scoped = { ...f, department: undefined };
  const where = conversationWhere(scoped);
  const conditions = conversationSqlConditions(scoped, { alias: "c" });
  const activeStatuses = ["open", "pending", "snoozed"].filter(
    (status) => !f.status?.length || f.status.includes(status),
  );

  const [aggregates, delayed] = await Promise.all([
    prisma.$queryRaw<DepartmentAggregate[]>(Prisma.sql`
      SELECT
        COALESCE(c."department", 'unknown') AS "department",
        COUNT(*)::bigint AS "volume",
        AVG(c."responseSeconds")::double precision AS "avgResponseSeconds",
        AVG(c."conversationDurationSeconds")::double precision AS "avgResolutionSeconds",
        COUNT(*) FILTER (WHERE c."status" = 'open')::bigint AS "open",
        COUNT(*) FILTER (WHERE c."status" IS DISTINCT FROM 'resolved')::bigint AS "unresolved",
        COUNT(*) FILTER (WHERE c."slaFirstResponseBreached" = TRUE)::bigint AS "slaBreaches"
      FROM "conversations" c
      ${andSql(conditions)}
      GROUP BY COALESCE(c."department", 'unknown')
    `),
    activeStatuses.length
      ? prisma.conversation.findMany({
          where: { ...where, status: { in: activeStatuses }, needsReply: true },
          orderBy: [{ assignedAt: "asc" }, { createdAtCw: "asc" }],
          take: 15,
          select: {
            chatwootId: true,
            contactName: true,
            department: true,
            assigneeName: true,
            assignedAt: true,
            createdAtCw: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const byDepartment = new Map(aggregates.map((row) => [row.department, row]));
  const result: DepartmentRow[] = DEPARTMENTS.map((department) => {
    const row = byDepartment.get(department);
    return {
      department,
      volume: asNumber(row?.volume),
      avgResponseSeconds: nullableNumber(row?.avgResponseSeconds),
      avgResolutionSeconds: nullableNumber(row?.avgResolutionSeconds),
      open: asNumber(row?.open),
      unresolved: asNumber(row?.unresolved),
      slaBreaches: asNumber(row?.slaBreaches),
    };
  });

  const now = Date.now();
  const topDelayed = delayed.map((row) => {
    const base = row.assignedAt ?? row.createdAtCw;
    return {
      chatwootId: row.chatwootId,
      contactName: row.contactName,
      department: row.department,
      assigneeName: row.assigneeName,
      waitingSeconds: base ? Math.max(0, Math.round((now - base.getTime()) / 1000)) : null,
    };
  });

  return { rows: result, topDelayed };
}

interface DepartmentAggregate {
  department: string;
  volume: bigint | number | string;
  avgResponseSeconds: number | string | null;
  avgResolutionSeconds: number | string | null;
  open: bigint | number | string;
  unresolved: bigint | number | string;
  slaBreaches: bigint | number | string;
}

function asNumber(value: bigint | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: bigint | number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
