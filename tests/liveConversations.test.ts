import { describe, it, expect } from "vitest";
import { fetchLiveConversations } from "@/lib/chatwoot/liveConversations";
import type { ChatwootClient } from "@/lib/chatwoot/client";
import type { ReportFilters } from "@/lib/reporting/filters";

/**
 * The core of the "Chatwoot says 11, the dashboard shows 6" fix: the detail LIST
 * must come from the SAME Chatwoot filter that produces the header count, so the
 * two can never disagree. These tests pin that the list is Chatwoot's, the total
 * is Chatwoot's `meta.all_count`, and the mirror is never consulted for it.
 */

const PAGE = 25;

function baseFilters(overrides: Partial<ReportFilters> = {}): ReportFilters {
  return {
    from: new Date("2026-06-01T00:00:00Z"),
    to: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

/** A fake Chatwoot filter endpoint: `total` matching conversations, 25 per page. */
function fakeClient(total: number, opts: { waitingEvery?: number } = {}) {
  let lastPayload: unknown = null;
  let lastPage = 0;
  const client = {
    filterConversations(payload: unknown, page: number) {
      lastPayload = payload;
      lastPage = page;
      const start = (page - 1) * PAGE;
      const count = Math.max(0, Math.min(PAGE, total - start));
      const payloadRows = Array.from({ length: count }, (_, i) => {
        const id = start + i + 1;
        const waiting = opts.waitingEvery && id % opts.waitingEvery === 0 ? 1_700_000_000 : 0;
        return {
          id,
          status: "open",
          waiting_since: waiting,
          meta: {
            assignee: { id: 7, name: "Mona" },
            team: { id: 3, name: "Sales" },
            sender: { id: 100 + id, name: `Customer ${id}`, phone_number: `+2010000${id}` },
          },
        };
      });
      return Promise.resolve({ payload: payloadRows, meta: { all_count: total } });
    },
    get lastPayload() {
      return lastPayload;
    },
    get lastPage() {
      return lastPage;
    },
  };
  return client as unknown as ChatwootClient & { lastPayload: unknown; lastPage: number };
}

describe("fetchLiveConversations", () => {
  it("returns Chatwoot's own list and total, so the list matches the count", async () => {
    const client = fakeClient(11);
    const result = await fetchLiveConversations("agent", 7, baseFilters(), { page: 1 }, client);

    expect(result).not.toBeNull();
    expect(result!.total).toBe(11); // meta.all_count — the header number
    expect(result!.rows).toHaveLength(11); // and the same 11 rows, not 6
    expect(result!.pages).toBe(1);
    expect(result!.source).toBe("chatwoot");
    expect(result!.rows[0]).toMatchObject({
      chatwootId: 1,
      contactName: "Customer 1",
      assigneeCwId: 7,
      teamCwId: 3,
    });
  });

  it("paginates against Chatwoot's 25-per-page and reports total pages", async () => {
    const client = fakeClient(60);
    const page1 = await fetchLiveConversations("agent", 7, baseFilters(), { page: 1 }, client);
    expect(page1!.rows).toHaveLength(25);
    expect(page1!.pages).toBe(3); // ceil(60/25)
    expect(page1!.total).toBe(60);

    const page3 = await fetchLiveConversations("agent", 7, baseFilters(), { page: 3 }, client);
    expect(page3!.rows).toHaveLength(10); // 60 - 50
    expect(client.lastPage).toBe(3);
  });

  it("derives needsReply from Chatwoot's waiting_since, not the mirror", async () => {
    const client = fakeClient(4, { waitingEvery: 2 }); // ids 2 and 4 are waiting
    const result = await fetchLiveConversations("agent", 7, baseFilters(), { page: 1 }, client);
    const waiting = result!.rows.filter((r) => r.needsReply).map((r) => r.chatwootId);
    expect(waiting).toEqual([2, 4]);
    expect(result!.rows.find((r) => r.chatwootId === 2)!.waitingSince).not.toBeNull();
    expect(result!.rows.find((r) => r.chatwootId === 1)!.waitingSince).toBeNull();
  });

  it("builds an assignee_id filter for an agent entity", async () => {
    const client = fakeClient(3);
    await fetchLiveConversations("agent", 7, baseFilters(), { page: 1 }, client);
    const payload = client.lastPayload as Array<{ attribute_key: string; values: string[] }>;
    expect(payload.some((p) => p.attribute_key === "assignee_id" && p.values.includes("7"))).toBe(true);
    expect(payload.some((p) => p.attribute_key === "status")).toBe(true);
  });

  it("returns null when filters cannot be expressed as a Chatwoot indexed filter", async () => {
    const client = fakeClient(11);
    // department, label, sla, needsReply, search are mirror-only concepts.
    expect(await fetchLiveConversations("agent", 7, baseFilters({ search: "ali" }), { page: 1 }, client)).toBeNull();
    expect(await fetchLiveConversations("agent", 7, baseFilters({ needsReply: true }), { page: 1 }, client)).toBeNull();
    expect(await fetchLiveConversations("agent", 7, baseFilters({ label: ["vip"] }), { page: 1 }, client)).toBeNull();
  });

  it("returns an empty page when the requested id is outside the filter-bar scope", async () => {
    const client = fakeClient(11);
    // The bar is scoped to agent 9; asking for agent 7's list must return nothing.
    const result = await fetchLiveConversations("agent", 7, baseFilters({ agentId: [9] }), { page: 1 }, client);
    expect(result!.rows).toHaveLength(0);
    expect(result!.total).toBe(0);
  });

  it("returns an empty page when the status filter excludes every active status", async () => {
    const client = fakeClient(11);
    const result = await fetchLiveConversations("agent", 7, baseFilters({ status: ["resolved"] }), { page: 1 }, client);
    expect(result!.rows).toHaveLength(0);
    expect(result!.total).toBe(0);
  });

  it("throws when Chatwoot omits meta.all_count, rather than inventing a total", async () => {
    const client = {
      filterConversations: () => Promise.resolve({ payload: [], meta: {} }),
    } as unknown as ChatwootClient;
    await expect(fetchLiveConversations("agent", 7, baseFilters(), { page: 1 }, client)).rejects.toThrow(/all_count/);
  });
});
