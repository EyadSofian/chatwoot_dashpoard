import { describe, it, expect, vi, beforeEach } from "vitest";
import { webhookDedupeKey } from "@/lib/ingest/dedupe";

/**
 * In-memory stand-in for the two tables that guarantee webhook idempotency.
 * Both enforce the real unique constraint by throwing Prisma's P2002, so the
 * production code path (catch → "duplicate") is the one under test.
 */
const store = vi.hoisted(() => ({
  rawEvents: [] as { dedupeKey: string; event: string | null }[],
  conversationEvents: [] as { dedupeKey: string; type: string }[],
  persistCalls: 0,
  reset() {
    this.rawEvents = [];
    this.conversationEvents = [];
    this.persistCalls = 0;
  },
}));

function uniqueViolation(): Error & { code: string } {
  const err = new Error("Unique constraint failed") as Error & { code: string };
  err.code = "P2002";
  return err;
}

vi.mock("@/lib/db", () => ({
  prisma: {
    rawEvent: {
      create: async ({ data }: { data: { dedupeKey: string; event: string | null } }) => {
        if (store.rawEvents.some((e) => e.dedupeKey === data.dedupeKey)) throw uniqueViolation();
        store.rawEvents.push(data);
        return data;
      },
      updateMany: async () => ({ count: 1 }),
    },
    conversationEvent: {
      create: async ({ data }: { data: { dedupeKey: string; type: string } }) => {
        if (store.conversationEvents.some((e) => e.dedupeKey === data.dedupeKey)) throw uniqueViolation();
        store.conversationEvents.push(data);
        return data;
      },
    },
  },
}));

vi.mock("@/lib/chatwoot/client", () => ({
  ChatwootClient: class {
    async conversationDetails(id: number) {
      return {
        id,
        status: "open",
        created_at: "2026-07-01T10:00:00Z",
        meta: { assignee: { id: 10, name: "Mona" } },
        custom_attributes: {},
        labels: [],
      };
    }
  },
}));

vi.mock("@/lib/chatwoot/fetchers", () => ({
  fetchAllMessages: async () => [
    { id: 500, message_type: 0, private: false, created_at: "2026-07-01T10:01:00Z", sender: { id: 5, type: "contact" } },
    { id: 501, message_type: 1, private: false, created_at: "2026-07-01T10:06:00Z", sender: { id: 10, type: "user" } },
  ],
}));

vi.mock("@/lib/ingest/context", () => ({
  buildAssembleContext: async () => ({
    botAgentIds: new Set<number>(),
    botLabel: "needs-bot",
    business: { timezone: "Africa/Cairo", startMinutes: 0, endMinutes: 1440, days: [0, 1, 2, 3, 4, 5, 6] },
    slaFirstResponseSeconds: 1800,
    slaResolutionSeconds: 86400,
    nearBreachRatio: 0.8,
    now: new Date("2026-07-01T12:00:00Z"),
  }),
}));

vi.mock("@/lib/ingest/persist", () => ({
  persistConversation: async () => {
    store.persistCalls++;
    return 1n;
  },
}));

// Imported after the mocks (vi.mock is hoisted above the imports).
const { processWebhook } = await import("@/lib/ingest/webhook");

const messageCreated = {
  event: "message_created",
  id: 501,
  message_type: 1,
  created_at: "2026-07-01T10:06:00Z",
  conversation: { id: 42, status: "open" },
};

const deliver = (body: Record<string, unknown>) =>
  processWebhook(Buffer.from(JSON.stringify(body), "utf8"), body, true);

describe("webhook dedupe key", () => {
  it("is stable for a byte-identical redelivery of the same event", () => {
    const body = Buffer.from(JSON.stringify(messageCreated), "utf8");
    expect(webhookDedupeKey("message_created", body)).toBe(webhookDedupeKey("message_created", body));
  });

  it("differs when the event name differs", () => {
    const body = Buffer.from(JSON.stringify(messageCreated), "utf8");
    expect(webhookDedupeKey("message_created", body)).not.toBe(webhookDedupeKey("message_updated", body));
  });

  it("differs when the payload differs", () => {
    const a = Buffer.from(JSON.stringify({ ...messageCreated, id: 501 }), "utf8");
    const b = Buffer.from(JSON.stringify({ ...messageCreated, id: 502 }), "utf8");
    expect(webhookDedupeKey("message_created", a)).not.toBe(webhookDedupeKey("message_created", b));
  });
});

describe("duplicate webhook idempotency", () => {
  beforeEach(() => store.reset());

  it("stores and reprocesses the first delivery", async () => {
    const res = await deliver(messageCreated);

    expect(res.ok).toBe(true);
    expect(res.duplicate).toBeUndefined();
    expect(res.stored).toBe(true);
    expect(res.reprocessed).toBe(true);
    expect(res.conversationCwId).toBe(42);
    expect(store.rawEvents).toHaveLength(1);
    expect(store.persistCalls).toBe(1);
  });

  it("does not store or recompute a redelivery of the same event", async () => {
    await deliver(messageCreated);
    const res = await deliver(messageCreated);

    expect(res.ok).toBe(true);
    expect(res.duplicate).toBe(true);
    expect(res.stored).toBe(false);
    expect(res.reprocessed).toBe(false);

    // The unique constraint held: one raw row, one recompute — no double count.
    expect(store.rawEvents).toHaveLength(1);
    expect(store.persistCalls).toBe(1);
  });

  it("stays idempotent across many redeliveries", async () => {
    for (let i = 0; i < 5; i++) await deliver(messageCreated);
    expect(store.rawEvents).toHaveLength(1);
    expect(store.persistCalls).toBe(1);
  });

  it("still ingests a genuinely different message on the same conversation", async () => {
    await deliver(messageCreated);
    const res = await deliver({ ...messageCreated, id: 502, created_at: "2026-07-01T10:09:00Z" });

    expect(res.duplicate).toBeUndefined();
    expect(store.rawEvents).toHaveLength(2);
    expect(store.persistCalls).toBe(2);
  });

  it("does not duplicate the derived assignment event when assignee_changed is redelivered", async () => {
    const assigned = {
      event: "assignee_changed",
      id: 42,
      created_at: "2026-07-01T10:00:00Z",
      assignee: { id: 10 },
      conversation: { id: 42, status: "open" },
    };

    await deliver(assigned);
    await deliver(assigned);

    expect(store.rawEvents).toHaveLength(1);
    expect(store.conversationEvents).toHaveLength(1);
    expect(store.conversationEvents[0]!.type).toBe("assigned");
  });

  it("stores the raw event but skips recompute for an event we do not derive metrics from", async () => {
    const res = await deliver({ event: "contact_updated", id: 7, conversation: { id: 42 } });

    expect(res.stored).toBe(true);
    expect(res.reprocessed).toBe(false);
    expect(res.reason).toBe("no_recompute");
    expect(store.persistCalls).toBe(0);
  });
});
