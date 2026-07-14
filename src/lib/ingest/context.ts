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

  let assignmentEvents: AssignEvent[] | undefined;
  let statusEvents: StatusEvent[] | undefined;
  if (conversationCwId != null) {
    const events = await prisma.conversationEvent.findMany({
      where: { conversationCwId },
      orderBy: { occurredAt: "asc" },
    });
    const assigns = events.filter((e) => e.type === "assigned" || e.type === "unassigned");
    if (assigns.length) {
      assignmentEvents = assigns.map((e) => ({
        assigneeId: e.type === "unassigned" ? null : e.toValue ? Number(e.toValue) : null,
        at: e.occurredAt,
      }));
    }
    const statuses = events.filter((e) =>
      ["resolved", "reopened", "open", "snoozed"].includes(e.type),
    );
    if (statuses.length) {
      statusEvents = statuses.map((e) => ({ type: e.type as StatusEventType, at: e.occurredAt }));
    }
  }

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
    assignmentEvents,
    statusEvents,
    now: new Date(),
  };
}
