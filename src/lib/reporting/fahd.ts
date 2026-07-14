import { prisma } from "@/lib/db";
import { average } from "@/lib/format";
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
  const handoffs = await prisma.botHandoff.findMany({
    where: {
      handoffAt: { gte: f.from, lte: f.to },
      ...(f.department?.length ? { department: { in: f.department } } : {}),
    },
    orderBy: { handoffAt: "desc" },
    take: 40000,
  });

  const routed = new Map<string, number>();
  const resp: number[] = [];
  let reentries = 0;
  let queued = 0;
  let replied = 0;
  for (const h of handoffs) {
    const dep = h.department ?? "unknown";
    routed.set(dep, (routed.get(dep) ?? 0) + 1);
    if (h.reentry) reentries++;
    if (h.queuedUnassigned) queued++;
    if (h.gotAgentReply) replied++;
    if (h.handoffToReplySeconds !== null) resp.push(h.handoffToReplySeconds);
  }

  const noReply = handoffs.filter((h) => !h.gotAgentReply).slice(0, 25);
  const convIds = noReply.map((h) => h.conversationCwId);
  const convs = convIds.length
    ? await prisma.conversation.findMany({
        where: { chatwootId: { in: convIds } },
        select: { chatwootId: true, contactName: true, status: true },
      })
    : [];
  const convMap = new Map(convs.map((c) => [c.chatwootId, c]));

  return {
    totalHandoffs: handoffs.length,
    resolvedReentries: reentries,
    routedByDepartment: [...routed.entries()].map(([department, count]) => ({ department, count })),
    queuedUnassigned: queued,
    gotAgentReply: replied,
    noAgentReply: handoffs.length - replied,
    avgHandoffToReplySeconds: average(resp),
    noReplyList: noReply.map((h) => ({
      chatwootId: h.conversationCwId,
      contactName: convMap.get(h.conversationCwId)?.contactName ?? null,
      department: h.department,
      handoffAt: h.handoffAt,
      status: convMap.get(h.conversationCwId)?.status ?? null,
    })),
  };
}
