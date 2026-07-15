import { prisma } from "@/lib/db";
import { env } from "@/env";
import { getSlaSettings, businessConfig } from "@/lib/settings";
import type { AssembleContext } from "@/lib/metrics/conversation";
import type { AssignEvent } from "@/lib/metrics/assignment";
import type { StatusEvent, StatusEventType } from "@/lib/metrics/resolution";

/** Build the deterministic context the metrics engine needs. */
export async function buildAssembleContext(conversationCwId?: number): Promise<AssembleContext> {
  const sla = await getSlaSettings();
  const business = businessConfig(sla);

  const inboxes = await prisma.inbox.findMany({ select: { id: true, name: true } });
  const inboxNameById = new Map<number, string>();
  for (const inbox of inboxes) if (inbox.name) inboxNameById.set(inbox.id, inbox.name);

  const history = conversationCwId != null ? await loadConversationEventContext(conversationCwId) : {};

  return {
    botAgentIds: new Set(env.botAgentIds().map(Number).filter((n) => Number.isFinite(n))),
    botLabel: env.botLabel(),
    business,
    slaFirstResponseSeconds: sla.firstResponseMinutes * 60,
    slaResolutionSeconds: sla.resolutionHours * 3600,
    nearBreachRatio: sla.nearBreachRatio,
    salesTeamId: env.salesTeamId(),
    operationsTeamId: env.operationsTeamId(),
    complaintsTeamId: env.complaintsTeamId(),
    inboxNameById,
    ...history,
    now: new Date(),
  };
}

/** Load only the per-conversation timeline, so batch syncs can reuse the expensive shared context. */
export async function loadConversationEventContext(conversationCwId: number): Promise<{
  assignmentEvents?: AssignEvent[];
  statusEvents?: StatusEvent[];
}> {
  const events = await prisma.conversationEvent.findMany({
    where: { conversationCwId },
    orderBy: { occurredAt: "asc" },
  });
  const assigns = events.filter((event) => event.type === "assigned" || event.type === "unassigned");
  const statuses = events.filter((event) => ["resolved", "reopened", "open", "snoozed"].includes(event.type));
  return {
    assignmentEvents: assigns.length
      ? assigns.map((event) => ({
          assigneeId: event.type === "unassigned" ? null : event.toValue ? Number(event.toValue) : null,
          at: event.occurredAt,
        }))
      : undefined,
    statusEvents: statuses.length
      ? statuses.map((event) => ({ type: event.type as StatusEventType, at: event.occurredAt }))
      : undefined,
  };
}
