import type { Prisma } from "@prisma/client";

/**
 * Every list filter is multi-select. A manager comparing Sales and Operations
 * side by side should not have to run the report twice.
 *
 * The URL carries them comma-separated: `?department=sales,operations&teamId=3,4`
 */
export interface ReportFilters {
  from: Date;
  to: Date;
  department?: string[];
  teamId?: number[];
  agentId?: number[];
  inboxId?: number[];
  status?: string[];
  campaignSource?: string[];
  campaignLabel?: string[];
  /** Chatwoot conversation labels. */
  label?: string[];
  sla?: string[];
  needsReply?: boolean;
  search?: string;
  /** Agents/Teams reports: hide rows with no activity in the period. */
  activeOnly?: boolean;
}

/** "sales,operations" → ["sales", "operations"]; empty/"all" → undefined. */
function strList(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v && v !== "all");
  return items.length ? [...new Set(items)] : undefined;
}

function numList(value: string | null): number[] | undefined {
  const items = strList(value);
  if (!items) return undefined;
  const nums = items.map(Number).filter((n) => Number.isFinite(n));
  return nums.length ? [...new Set(nums)] : undefined;
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

  const safeFrom = Number.isNaN(from.getTime()) ? defaultFrom : from;
  const safeTo = Number.isNaN(to.getTime()) ? now : to;
  // A reversed range would silently return nothing. Swap rather than lie.
  const [lo, hi] = safeFrom.getTime() <= safeTo.getTime() ? [safeFrom, safeTo] : [safeTo, safeFrom];

  return {
    from: lo,
    to: hi,
    department: strList(searchParams.get("department")),
    teamId: numList(searchParams.get("teamId")),
    agentId: numList(searchParams.get("agentId")),
    inboxId: numList(searchParams.get("inboxId")),
    status: strList(searchParams.get("status")),
    campaignSource: strList(searchParams.get("campaignSource")),
    campaignLabel: strList(searchParams.get("campaignLabel")),
    label: strList(searchParams.get("label")),
    sla: strList(searchParams.get("sla")),
    needsReply: searchParams.get("needsReply") === "true" ? true : undefined,
    search: clean(searchParams.get("search")),
    activeOnly: searchParams.get("activeOnly") === "true" ? true : undefined,
  };
}

/** Prisma where-clause for conversations from the filter set. */
export function conversationWhere(
  f: ReportFilters,
  opts: { ignoreDate?: boolean; ignoreAgent?: boolean; ignoreTeam?: boolean } = {},
): Prisma.ConversationWhereInput {
  const where: Prisma.ConversationWhereInput = {};

  if (!opts.ignoreDate) {
    where.createdAtCw = { gte: f.from, lte: f.to };
  }
  if (f.department?.length) where.department = { in: f.department };
  if (!opts.ignoreTeam && f.teamId?.length) where.teamCwId = { in: f.teamId };
  if (!opts.ignoreAgent && f.agentId?.length) where.assigneeCwId = { in: f.agentId };
  if (f.inboxId?.length) where.inboxCwId = { in: f.inboxId };
  if (f.status?.length) where.status = { in: f.status };

  if (f.campaignSource?.length) {
    where.isCampaign = true;
    where.campaignSource = { in: f.campaignSource };
  }
  if (f.campaignLabel?.length) where.campaignLabel = { in: f.campaignLabel };
  // A conversation matches if it carries ANY of the selected labels.
  if (f.label?.length) where.labels = { hasSome: f.label };
  if (f.needsReply) where.needsReply = true;

  // `slaFirstResponseState` is 'breached' | 'near_breach' | 'healthy', so the
  // selected states map straight onto it.
  if (f.sla?.length) where.slaFirstResponseState = { in: f.sla };

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

  const setList = (key: string, values?: (string | number)[]) => {
    if (values?.length) p.set(key, values.join(","));
  };

  setList("department", f.department);
  setList("teamId", f.teamId);
  setList("agentId", f.agentId);
  setList("inboxId", f.inboxId);
  setList("status", f.status);
  setList("campaignSource", f.campaignSource);
  setList("campaignLabel", f.campaignLabel);
  setList("label", f.label);
  setList("sla", f.sla);

  if (f.needsReply) p.set("needsReply", "true");
  if (f.search) p.set("search", f.search);
  if (f.activeOnly) p.set("activeOnly", "true");
  return p.toString();
}
