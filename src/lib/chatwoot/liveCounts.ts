import { ChatwootClient, getMeta } from "./client";
import type { ReportFilters } from "@/lib/reporting/filters";

const ACTIVE_STATUSES = ["open", "pending", "snoozed"] as const;
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 24;
const CONCURRENCY = 12;

export interface LiveEntityCount {
  id: number;
  open: number;
  active: number;
}

export interface LiveCountResult {
  counts: LiveEntityCount[];
  snapshotAt: string;
}

export interface LiveAccountCount {
  open: number;
  active: number;
  snapshotAt: string;
}

interface CacheEntry {
  expiresAt: number;
  value: LiveCountResult;
}

const cache = new Map<string, CacheEntry>();

type FilterItem = {
  attribute_key: string;
  filter_operator: "equal_to";
  values: string[];
  query_operator: "AND" | null;
};

/**
 * Chatwoot's indexed conversation filter returns `meta.all_count` without
 * paging through every matching conversation. On this account that is the
 * difference between 130 small count requests and walking more than 2,200
 * pages just to answer "how many are assigned to each agent right now?".
 */
export async function fetchLiveCountsByEntity(
  entity: "agent" | "team",
  ids: number[],
  f: ReportFilters,
  client = new ChatwootClient(),
): Promise<LiveCountResult | null> {
  if (!ids.length) return { counts: [], snapshotAt: new Date().toISOString() };
  if (!supportsLiveFilters(f)) return null;

  const selectedIds = entity === "agent" ? f.agentId : f.teamId;
  const activeStatuses = ACTIVE_STATUSES.filter((status) => !f.status?.length || f.status.includes(status));
  const key = JSON.stringify({ entity, ids: [...ids].sort((a, b) => a - b), filters: cacheableFilters(f) });
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const counts = await mapConcurrent(ids, CONCURRENCY, async (id): Promise<LiveEntityCount> => {
    if (selectedIds?.length && !selectedIds.includes(id)) return { id, open: 0, active: 0 };
    if (!activeStatuses.length) return { id, open: 0, active: 0 };

    const base = basePayload(entity, id, f);
    const activePromise = count(client, base, [...activeStatuses]);
    const openPromise = activeStatuses.includes("open")
      ? activeStatuses.length === 1
        ? activePromise
        : count(client, base, ["open"])
      : Promise.resolve(0);
    const [active, open] = await Promise.all([activePromise, openPromise]);
    return { id, open, active };
  });

  const value = { counts, snapshotAt: new Date().toISOString() };
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
  return value;
}

/** Exact account-level current workload, including unassigned conversations. */
export async function fetchLiveAccountCount(
  f: ReportFilters,
  client = new ChatwootClient(),
): Promise<LiveAccountCount | null> {
  if (!supportsLiveFilters(f)) return null;
  const activeStatuses = ACTIVE_STATUSES.filter((status) => !f.status?.length || f.status.includes(status));
  if (!activeStatuses.length) return { open: 0, active: 0, snapshotAt: new Date().toISOString() };

  const key = JSON.stringify({ entity: "account", filters: cacheableFilters(f) });
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    const account = cached.value.counts[0];
    return { open: account?.open ?? 0, active: account?.active ?? 0, snapshotAt: cached.value.snapshotAt };
  }

  const base = accountPayload(f);
  const activePromise = count(client, base, [...activeStatuses]);
  const openPromise = activeStatuses.includes("open")
    ? activeStatuses.length === 1
      ? activePromise
      : count(client, base, ["open"])
    : Promise.resolve(0);
  const [active, open] = await Promise.all([activePromise, openPromise]);
  const snapshotAt = new Date().toISOString();
  const value: LiveCountResult = { counts: [{ id: 0, open, active }], snapshotAt };
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
  return { open, active, snapshotAt };
}

export function clearLiveCountCache(): void {
  cache.clear();
}

/** Filters that map exactly onto Chatwoot's standard indexed filter fields. */
export function supportsLiveFilters(f: ReportFilters): boolean {
  return !(
    f.department?.length ||
    f.campaignSource?.length ||
    f.campaignLabel?.length ||
    f.label?.length ||
    f.sla?.length ||
    f.needsReply ||
    f.search
  );
}

function basePayload(entity: "agent" | "team", id: number, f: ReportFilters): FilterItem[] {
  const items: FilterItem[] = [item(entity === "agent" ? "assignee_id" : "team_id", [id])];
  if (entity !== "agent" && f.agentId?.length) items.push(item("assignee_id", f.agentId));
  if (entity !== "team" && f.teamId?.length) items.push(item("team_id", f.teamId));
  if (f.inboxId?.length) items.push(item("inbox_id", f.inboxId));
  return items;
}

function accountPayload(f: ReportFilters): FilterItem[] {
  const items: FilterItem[] = [];
  if (f.agentId?.length) items.push(item("assignee_id", f.agentId));
  if (f.teamId?.length) items.push(item("team_id", f.teamId));
  if (f.inboxId?.length) items.push(item("inbox_id", f.inboxId));
  return items;
}

async function count(client: ChatwootClient, base: FilterItem[], statuses: string[]): Promise<number> {
  const payload = [...base, item("status", statuses, null)].map((entry, index, all) => ({
    ...entry,
    query_operator: index === all.length - 1 ? null : "AND",
  }));
  const response = await client.filterConversations(payload, 1);
  const raw = getMeta(response).all_count;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) throw new Error("Chatwoot filter response did not include meta.all_count");
  return value;
}

function item(attribute_key: string, values: Array<string | number>, query_operator: "AND" | null = "AND"): FilterItem {
  return {
    attribute_key,
    filter_operator: "equal_to",
    values: values.map(String),
    query_operator,
  };
}

function cacheableFilters(f: ReportFilters) {
  return {
    agentId: f.agentId,
    teamId: f.teamId,
    inboxId: f.inboxId,
    status: f.status,
  };
}

async function mapConcurrent<T, R>(values: T[], concurrency: number, worker: (value: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(values.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (true) {
        const index = next++;
        if (index >= values.length) return;
        result[index] = await worker(values[index]!);
      }
    }),
  );
  return result;
}
