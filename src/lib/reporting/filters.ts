import type { Prisma } from "@prisma/client";

export interface ReportFilters {
  from: Date;
  to: Date;
  department?: string;
  teamId?: number;
  agentId?: number;
  inboxId?: number;
  status?: string;
  campaignSource?: string;
  campaignLabel?: string;
  sla?: "breached" | "near_breach" | "healthy";
  needsReply?: boolean;
  search?: string;
}

function parseIntOrUndef(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse dashboard query params into a normalized filter set (default: 30d). */
export function parseFilters(searchParams: URLSearchParams): ReportFilters {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 86400 * 1000);

  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  const from = fromRaw ? new Date(fromRaw) : defaultFrom;
  const to = toRaw ? new Date(toRaw) : now;

  const clean = (v: string | null) => (v && v !== "all" && v !== "" ? v : undefined);

  return {
    from: Number.isNaN(from.getTime()) ? defaultFrom : from,
    to: Number.isNaN(to.getTime()) ? now : to,
    department: clean(searchParams.get("department")),
    teamId: parseIntOrUndef(searchParams.get("teamId")),
    agentId: parseIntOrUndef(searchParams.get("agentId")),
    inboxId: parseIntOrUndef(searchParams.get("inboxId")),
    status: clean(searchParams.get("status")),
    campaignSource: clean(searchParams.get("campaignSource")),
    campaignLabel: clean(searchParams.get("campaignLabel")),
    sla: (clean(searchParams.get("sla")) as ReportFilters["sla"]) || undefined,
    needsReply: searchParams.get("needsReply") === "true" ? true : undefined,
    search: clean(searchParams.get("search")),
  };
}

/** Prisma where-clause for conversations from the filter set. */
export function conversationWhere(f: ReportFilters, opts: { ignoreDate?: boolean } = {}): Prisma.ConversationWhereInput {
  const where: Prisma.ConversationWhereInput = {};

  if (!opts.ignoreDate) {
    where.createdAtCw = { gte: f.from, lte: f.to };
  }
  if (f.department) where.department = f.department;
  if (f.teamId !== undefined) where.teamCwId = f.teamId;
  if (f.agentId !== undefined) where.assigneeCwId = f.agentId;
  if (f.inboxId !== undefined) where.inboxCwId = f.inboxId;
  if (f.status) where.status = f.status;
  if (f.campaignSource) {
    where.isCampaign = true;
    where.campaignSource = f.campaignSource;
  }
  if (f.campaignLabel) where.campaignLabel = f.campaignLabel;
  if (f.needsReply) where.needsReply = true;
  if (f.sla === "breached") where.slaFirstResponseBreached = true;
  else if (f.sla) where.slaFirstResponseState = f.sla;

  if (f.search) {
    const asId = Number(f.search);
    where.OR = [
      { contactName: { contains: f.search, mode: "insensitive" } },
      { contactPhone: { contains: f.search } },
      ...(Number.isFinite(asId) ? [{ chatwootId: asId }] : []),
    ];
  }

  return where;
}

/** Serialize filters back to a query string (for CSV export links etc.). */
export function filtersToQuery(f: ReportFilters): string {
  const p = new URLSearchParams();
  p.set("from", f.from.toISOString());
  p.set("to", f.to.toISOString());
  if (f.department) p.set("department", f.department);
  if (f.teamId !== undefined) p.set("teamId", String(f.teamId));
  if (f.agentId !== undefined) p.set("agentId", String(f.agentId));
  if (f.inboxId !== undefined) p.set("inboxId", String(f.inboxId));
  if (f.status) p.set("status", f.status);
  if (f.campaignSource) p.set("campaignSource", f.campaignSource);
  if (f.campaignLabel) p.set("campaignLabel", f.campaignLabel);
  if (f.sla) p.set("sla", f.sla);
  if (f.needsReply) p.set("needsReply", "true");
  if (f.search) p.set("search", f.search);
  return p.toString();
}
