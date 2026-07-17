import { ChatwootClient, getMeta, getPayload } from "./client";
import type { CwConversation } from "./types";
import {
  activeStatusesFor,
  entityConversationFilter,
  supportsLiveFilters,
} from "./liveCounts";
import type { ReportFilters } from "@/lib/reporting/filters";

/**
 * The live conversation LIST for one agent or team, read straight from
 * Chatwoot's indexed `/conversations/filter` — the same query that produces the
 * header count in `liveCounts.ts`. Because the list and the count come from one
 * filter, the detail list can never disagree with the number above it (the
 * "Chatwoot says 11, the dashboard shows 6" bug).
 *
 * PostgreSQL is NOT the source of truth here. It only *enriches* these rows
 * afterwards (response time, resolved duration, department) by chatwootId. A
 * conversation Chatwoot returns but we have never ingested still appears — it is
 * simply shown without the history-derived columns, instead of vanishing.
 */

/** Chatwoot pages conversations 25 at a time; we mirror that page size. */
export const CHATWOOT_PAGE_SIZE = 25;

export interface LiveConversationRow {
  chatwootId: number;
  displayId: number | null;
  status: string | null;
  assigneeCwId: number | null;
  assigneeName: string | null;
  teamCwId: number | null;
  teamName: string | null;
  inboxCwId: number | null;
  contactName: string | null;
  contactPhone: string | null;
  labels: string[];
  unreadCount: number;
  /** ISO time the customer has been waiting for a human reply, or null. */
  waitingSince: string | null;
  /** Direct live signal: the customer is waiting and no agent has answered yet. */
  needsReply: boolean;
  createdAtCw: string | null;
  lastActivityAt: string | null;
}

export interface LiveConversationsPage {
  rows: LiveConversationRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  snapshotAt: string;
  source: "chatwoot";
}

/**
 * One page of an entity's current workload. Returns `null` when the active
 * filters cannot be expressed as a Chatwoot indexed filter (department, label,
 * SLA, search…), so the caller can fall back to the database with a clear note
 * rather than silently showing a wrong list.
 */
export async function fetchLiveConversations(
  entity: "agent" | "team",
  id: number,
  f: ReportFilters,
  opts: { page?: number } = {},
  client = new ChatwootClient(),
): Promise<LiveConversationsPage | null> {
  if (!supportsLiveFilters(f)) return null;

  const page = Math.max(1, opts.page ?? 1);
  const statuses = activeStatusesFor(f);
  const snapshotAt = new Date().toISOString();

  // A status filter that excludes every active status means "no live workload".
  if (!statuses.length) {
    return { rows: [], total: 0, page, pageSize: CHATWOOT_PAGE_SIZE, pages: 0, snapshotAt, source: "chatwoot" };
  }

  // Respect an explicit agent/team scope from the global filter bar: asking for
  // team 3's list while the bar is scoped to agent 9 should return nothing, not
  // team 3's whole workload.
  const scoped = entity === "agent" ? f.agentId : f.teamId;
  if (scoped?.length && !scoped.includes(id)) {
    return { rows: [], total: 0, page, pageSize: CHATWOOT_PAGE_SIZE, pages: 0, snapshotAt, source: "chatwoot" };
  }

  const payload = entityConversationFilter(entity, id, statuses, f);
  const response = await client.filterConversations(payload, page);
  const conversations = getPayload<CwConversation>(response);

  const rawTotal = getMeta(response).all_count;
  const total = Number(rawTotal);
  if (!Number.isFinite(total)) {
    throw new Error("Chatwoot filter response did not include meta.all_count");
  }

  const rows = conversations.map(mapConversation);
  return {
    rows,
    total,
    page,
    pageSize: CHATWOOT_PAGE_SIZE,
    pages: Math.ceil(total / CHATWOOT_PAGE_SIZE),
    snapshotAt,
    source: "chatwoot",
  };
}

function mapConversation(conv: CwConversation): LiveConversationRow {
  const assignee = conv.meta?.assignee ?? null;
  const team = conv.meta?.team ?? null;
  const contact = conv.meta?.sender ?? conv.contact ?? null;
  const waitingSince = epochToIso(conv.waiting_since);

  return {
    chatwootId: conv.id,
    displayId: typeof conv.display_id === "number" ? conv.display_id : null,
    status: conv.status ?? null,
    assigneeCwId: typeof assignee?.id === "number" ? assignee.id : null,
    assigneeName: assignee?.name ?? assignee?.available_name ?? null,
    teamCwId: typeof team?.id === "number" ? team.id : typeof conv.team_id === "number" ? conv.team_id : null,
    teamName: team?.name ?? null,
    inboxCwId: typeof conv.inbox_id === "number" ? conv.inbox_id : null,
    contactName: contact?.name ?? null,
    contactPhone: contact?.phone_number ?? null,
    labels: Array.isArray(conv.labels) ? conv.labels : [],
    unreadCount: typeof conv.unread_count === "number" ? conv.unread_count : 0,
    waitingSince,
    needsReply: waitingSince !== null,
    createdAtCw: epochToIso(conv.created_at),
    lastActivityAt: epochToIso(conv.last_activity_at),
  };
}

/** Chatwoot timestamps are epoch seconds (numbers) or ISO strings; 0/"" = absent. */
function epochToIso(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "" || value === 0) return null;
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) return new Date(asNumber * 1000).toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
