import { prisma } from "@/lib/db";
import type { ReportFilters } from "./filters";

export interface FahdResult {
  totalHandoffs: number;
  resolvedReentries: number;
  routedByDepartment: { department: string; count: number }[];
  queuedUnassigned: number;
  gotAgentReply: number;
  noAgentReply: number;
  avgHandoffToReplySeconds: number | null;
  noReplyList: {
    chatwootId: number;
    contactName: string | null;
    department: string | null;
    handoffAt: Date;
    status: string | null;
  }[];
}

export async function getFahd(f: ReportFilters): Promise<FahdResult> {
  const where = {
    handoffAt: { gte: f.from, lte: f.to },
    ...(f.department?.length ? { department: { in: f.department } } : {}),
  };
  const [aggregate, reentries, queued, replied, routed, noReply] = await Promise.all([
    prisma.botHandoff.aggregate({
      where,
      _count: { _all: true },
      _avg: { handoffToReplySeconds: true },
    }),
    prisma.botHandoff.count({ where: { ...where, reentry: true } }),
    prisma.botHandoff.count({ where: { ...where, queuedUnassigned: true } }),
    prisma.botHandoff.count({ where: { ...where, gotAgentReply: true } }),
    prisma.botHandoff.groupBy({ by: ["department"], where, _count: { _all: true } }),
    prisma.botHandoff.findMany({
      where: { ...where, gotAgentReply: false },
      orderBy: { handoffAt: "desc" },
      take: 25,
      select: {
        conversationCwId: true,
        department: true,
        handoffAt: true,
        conversation: { select: { contactName: true, status: true } },
      },
    }),
  ]);
  const total = aggregate._count._all;

  return {
    totalHandoffs: total,
    resolvedReentries: reentries,
    routedByDepartment: routed.map((row) => ({
      department: row.department ?? "unknown",
      count: row._count._all,
    })),
    queuedUnassigned: queued,
    gotAgentReply: replied,
    noAgentReply: total - replied,
    avgHandoffToReplySeconds: aggregate._avg.handoffToReplySeconds,
    noReplyList: noReply.map((h) => ({
      chatwootId: h.conversationCwId,
      contactName: h.conversation.contactName,
      department: h.department,
      handoffAt: h.handoffAt,
      status: h.conversation.status,
    })),
  };
}
