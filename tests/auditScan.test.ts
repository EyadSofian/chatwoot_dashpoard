import { describe, it, expect } from "vitest";
import { fetchLiveWorkload } from "@/lib/audit/workload";
import type { ChatwootClient } from "@/lib/chatwoot/client";

/**
 * The bug: the audit capped the live scan at 200 pages and guessed the last page
 * by `batch.length < 25`. For an account with ~810 pages of active conversations
 * the snapshot truncated, which inflated every "dashboard has more than Chatwoot"
 * difference — the exact thing Operations complained about. The scan now pages
 * until Chatwoot's own `meta.all_count` is reached.
 */

const PAGE = 25;

/** A fake Chatwoot that serves `perStatus[status]` conversations, 25 per page,
 *  and reports the true total in meta.all_count — exactly like the real API. */
function fakeClient(perStatus: Record<string, number>) {
  let calls = 0;
  const client = {
    listConversations({ status, page }: { status: string; page: number }) {
      calls++;
      const total = perStatus[status] ?? 0;
      const start = (page - 1) * PAGE;
      const count = Math.max(0, Math.min(PAGE, total - start));
      const payload = Array.from({ length: count }, (_, i) => ({
        id: (status.charCodeAt(0) * 100000) + start + i, // unique across statuses
        status,
        meta: { assignee: { id: 10, name: "A" } },
      }));
      return Promise.resolve({ data: { payload, meta: { all_count: total } } });
    },
    get calls() {
      return calls;
    },
  };
  return client as unknown as ChatwootClient & { calls: number };
}

describe("fetchLiveWorkload scans completely", () => {
  it("collects every active conversation across a large account, untruncated", async () => {
    // ~810 pages total, like the reported instance.
    const client = fakeClient({ open: 18000, pending: 1500, snoozed: 800 });
    const { conversations, truncated } = await fetchLiveWorkload(client);

    expect(conversations.length).toBe(18000 + 1500 + 800);
    expect(truncated).toBe(false); // the whole point — nothing dropped
  });

  it("stops exactly when meta.all_count is reached, not one page early or late", async () => {
    // 60 open = 3 pages (25+25+10). Plus a first page read for the two empty statuses.
    const client = fakeClient({ open: 60, pending: 0, snoozed: 0 });
    const { conversations } = await fetchLiveWorkload(client);

    expect(conversations.length).toBe(60);
    // 3 pages for open + 1 each for the two empty statuses = 5 requests.
    expect(client.calls).toBe(5);
  });

  it("handles an exact page-boundary total without an extra request", async () => {
    // 50 = exactly 2 full pages. all_count tells us to stop; no wasted 3rd call.
    const client = fakeClient({ open: 50, pending: 0, snoozed: 0 });
    const { conversations } = await fetchLiveWorkload(client);

    expect(conversations.length).toBe(50);
    expect(client.calls).toBe(4); // 2 for open + 1 + 1 empty
  });

  it("marks truncated only when the runaway safety bound is actually hit", async () => {
    // Force the cap tiny so we can prove the honest-truncation path.
    const client = fakeClient({ open: 10000, pending: 0, snoozed: 0 });
    const { truncated, conversations } = await fetchLiveWorkload(client, { maxPages: 3 });

    expect(truncated).toBe(true);
    expect(conversations.length).toBeLessThan(10000); // partial, and it says so
  });

  it("reads the assignee off each returned conversation", async () => {
    const client = fakeClient({ open: 5, pending: 0, snoozed: 0 });
    const { conversations } = await fetchLiveWorkload(client);
    expect(conversations.every((c) => c.assigneeCwId === 10)).toBe(true);
  });
});
