import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildAgentLeaderboard,
  type AgentInterval,
  type AgentRecord,
  type CurrentConversation,
} from "@/lib/reporting/agents";
import {
  resolveRange,
  parseDateInput,
  toDateInput,
  cairoStartOfDay,
  cairoEndOfDay,
} from "@/lib/dateRange";
import { parseFilters, filtersToQuery, conversationWhere } from "@/lib/reporting/filters";

const ROSTER: AgentRecord[] = [
  { id: 10, name: "منى", email: "mona@x.com", availability: "online" },
  { id: 20, name: "أحمد", email: "ahmed@x.com", availability: "offline" },
  { id: 30, name: "نورهان", email: "nour@x.com", availability: "offline" },
];

const live = (assigneeCwId: number, status = "open", needsReply = false): CurrentConversation => ({
  assigneeCwId,
  status,
  needsReply,
});

const interval = (
  assigneeCwId: number,
  conversationCwId: number,
  over: Partial<AgentInterval> = {},
): AgentInterval => ({
  assigneeCwId,
  conversationCwId,
  responseSeconds: null,
  responded: false,
  ...over,
});

const build = (input: Partial<Parameters<typeof buildAgentLeaderboard>[0]>) =>
  buildAgentLeaderboard({
    agents: ROSTER,
    current: [],
    intervals: [],
    created: [],
    resolved: [],
    ...input,
  });

/* ─────────────────────────────────────────────────────────────────────────────
   THE BUG. Chatwoot shows 11 active for an agent; the dashboard showed 6,
   because it counted only the conversations CREATED inside the date range and
   called that "Assigned".
   ───────────────────────────────────────────────────────────────────────────── */
describe("Chatwoot says 11, the dashboard said 6", () => {
  // 11 conversations are open and assigned to Mona right now.
  const current = Array.from({ length: 11 }, () => live(10));
  // Only 6 of them were created inside the selected window.
  const created = Array.from({ length: 6 }, () => ({ assigneeCwId: 10 }));

  it("reports current workload = 11, ignoring the date range entirely", () => {
    const { rows } = build({ current, created });
    const mona = rows.find((r) => r.agentId === 10)!;

    expect(mona.currentWorkload).toBe(11);
    expect(mona.currentOpen).toBe(11);
  });

  it("reports the 6 as 'created in period' — never as workload", () => {
    const { rows } = build({ current, created });
    const mona = rows.find((r) => r.agentId === 10)!;

    expect(mona.createdInPeriod).toBe(6);
    // The two numbers are different questions and must not be confused.
    expect(mona.currentWorkload).not.toBe(mona.createdInPeriod);
  });

  it("does not expose any field that would render as a misleading 'Assigned = 6'", () => {
    const { rows } = build({ current, created });
    const mona = rows.find((r) => r.agentId === 10)!;

    // `assignedInPeriod` comes from assignment intervals, not from creation. No
    // intervals were supplied, so it is 0 — it can never silently become "6".
    expect(mona.assignedInPeriod).toBe(0);
    expect(Object.keys(mona)).not.toContain("assigned");
    expect(Object.keys(mona)).not.toContain("conversations");
  });

  it("counts only active statuses as workload — resolved is finished work", () => {
    const { rows } = build({
      current: [live(10, "open"), live(10, "pending"), live(10, "snoozed"), live(10, "resolved")],
    });
    const mona = rows.find((r) => r.agentId === 10)!;

    expect(mona.currentOpen).toBe(1);
    expect(mona.currentPending).toBe(1);
    expect(mona.currentSnoozed).toBe(1);
    expect(mona.currentWorkload).toBe(3); // resolved is excluded
  });

  it("reports needs-reply as a live number, not a windowed one", () => {
    const { rows, summary } = build({
      current: [live(10, "open", true), live(10, "open", false), live(20, "pending", true)],
    });

    expect(rows.find((r) => r.agentId === 10)!.needsReplyNow).toBe(1);
    expect(summary.needsReplyNow).toBe(2);
  });
});

describe("assignment metrics come from the intervals, not from ownership", () => {
  it("counts distinct conversations for 'assigned in period'", () => {
    const { rows } = build({
      intervals: [interval(10, 100), interval(10, 200), interval(10, 300)],
    });
    expect(rows.find((r) => r.agentId === 10)!.assignedInPeriod).toBe(3);
  });

  it("counts one conversation re-assigned to the SAME agent twice once — but as two events", () => {
    const { rows } = build({
      intervals: [interval(10, 100), interval(10, 100), interval(10, 200)],
    });
    const mona = rows.find((r) => r.agentId === 10)!;

    expect(mona.assignedInPeriod).toBe(2); // conversations 100 and 200
    expect(mona.assignmentEvents).toBe(3); // three assignment records
  });

  it("attributes an interval to the agent it was assigned to, not the current owner", () => {
    // The conversation is currently Ahmed's, but it was assigned to Mona in the period.
    const { rows } = build({
      current: [live(20)],
      intervals: [interval(10, 500, { responded: true, responseSeconds: 120 })],
    });

    expect(rows.find((r) => r.agentId === 10)!.assignedInPeriod).toBe(1);
    expect(rows.find((r) => r.agentId === 20)!.assignedInPeriod).toBe(0);
    expect(rows.find((r) => r.agentId === 20)!.currentWorkload).toBe(1);
  });

  it("reports the response-time distribution over answered assignments only", () => {
    const { rows, summary } = build({
      intervals: [
        interval(10, 1, { responded: true, responseSeconds: 100 }),
        interval(10, 2, { responded: true, responseSeconds: 200 }),
        interval(10, 3, { responded: true, responseSeconds: 300 }),
        interval(10, 4, { responded: true, responseSeconds: 1000 }),
        interval(10, 5), // assigned, never answered — must not count as 0
      ],
    });
    const mona = rows.find((r) => r.agentId === 10)!;

    expect(mona.responseCount).toBe(4);
    expect(mona.firstResponsesInPeriod).toBe(4);
    expect(mona.avgResponseSeconds).toBe(400);
    expect(mona.medianResponseSeconds).toBe(250);
    expect(mona.p90ResponseSeconds).toBe(1000);
    expect(mona.maxResponseSeconds).toBe(1000);
    // The unanswered assignment still counts as assigned.
    expect(mona.assignedInPeriod).toBe(5);
    expect(summary.p90ResponseSeconds).toBe(1000);
  });

  it("counts an SLA breach once per conversation, not once per assignment", () => {
    const { rows } = build({
      intervals: [
        interval(10, 100, { slaBreached: true }),
        interval(10, 100, { slaBreached: true }), // same conversation, re-assigned
        interval(10, 200, { slaBreached: false }),
      ],
    });
    expect(rows.find((r) => r.agentId === 10)!.slaBreaches).toBe(1);
  });

  it("labels resolved work honestly — resolved WHILE assigned, not resolved BY", () => {
    const { rows } = build({ resolved: [{ assigneeCwId: 10 }, { assigneeCwId: 10 }] });
    const mona = rows.find((r) => r.agentId === 10)!;

    // Chatwoot does not tell us who pressed resolve, so the field is named for
    // what we actually know.
    expect(mona.resolvedWhileAssigned).toBe(2);
    expect(Object.keys(mona)).not.toContain("resolvedBy");
  });
});

describe("the roster is never shrunk by the date range", () => {
  it("keeps an agent with no activity at all", () => {
    const { rows } = build({ current: [live(10)] });

    expect(rows.map((r) => r.agentId).sort()).toEqual([10, 20, 30]);
    const idle = rows.find((r) => r.agentId === 30)!;
    expect(idle.hasActivity).toBe(false);
    expect(idle.currentWorkload).toBe(0);
    expect(idle.assignedInPeriod).toBe(0);
    expect(idle.avgResponseSeconds).toBeNull();
  });

  it("counts live workload alone as activity", () => {
    // Nothing happened in the window, but they are holding five conversations.
    const { rows } = build({ current: Array.from({ length: 5 }, () => live(20)) });
    expect(rows.find((r) => r.agentId === 20)!.hasActivity).toBe(true);
  });

  it("hides idle agents only when activeOnly is on", () => {
    const input = { current: [live(10)] };
    expect(build(input).rows).toHaveLength(3);

    const filtered = build({ ...input, activeOnly: true });
    expect(filtered.rows.map((r) => r.agentId)).toEqual([10]);
    expect(filtered.summary.totalAgents).toBe(3); // the summary still describes the roster
  });

  it("still reports an assignee missing from the roster", () => {
    const { rows } = build({ agents: [], current: [live(99)] });
    expect(rows.find((r) => r.agentId === 99)?.currentWorkload).toBe(1);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   Cairo boundaries
   ───────────────────────────────────────────────────────────────────────────── */
describe("date boundaries are Cairo, not the browser's timezone", () => {
  it("starts the Cairo day at 21:00Z or 22:00Z, never at the viewer's midnight", () => {
    // 14 Jul 2026 12:00 UTC. Cairo is UTC+3 in July (DST).
    const start = cairoStartOfDay(new Date("2026-07-14T12:00:00Z"));
    expect(start.toISOString()).toBe("2026-07-13T21:00:00.000Z"); // = 00:00 Cairo on the 14th

    const end = cairoEndOfDay(new Date("2026-07-14T12:00:00Z"));
    expect(end.toISOString()).toBe("2026-07-14T20:59:59.999Z"); // = 23:59:59.999 Cairo
  });

  it("handles the winter offset (UTC+2) as well", () => {
    const start = cairoStartOfDay(new Date("2026-02-10T12:00:00Z"));
    expect(start.toISOString()).toBe("2026-02-09T22:00:00.000Z"); // = 00:00 Cairo on the 10th
  });

  it("parses a custom date as a whole Cairo day, so the last day is not cut off", () => {
    const from = parseDateInput("2026-02-01")!;
    const to = parseDateInput("2026-02-28", { endOfDay: true })!;

    expect(from.toISOString()).toBe("2026-01-31T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-02-28T21:59:59.999Z");
    expect(to.getTime()).toBeGreaterThan(from.getTime());
  });

  it("round-trips an instant back to the Cairo calendar day it belongs to", () => {
    // 22:30 UTC on the 13th is already the 14th in Cairo.
    expect(toDateInput(new Date("2026-07-13T22:30:00Z"))).toBe("2026-07-14");
  });

  it("anchors 'today' and 'this month' on Cairo", () => {
    const now = new Date("2026-07-14T12:00:00Z");

    expect(resolveRange("today", now).from.toISOString()).toBe("2026-07-13T21:00:00.000Z");
    expect(resolveRange("this_month", now).from.toISOString()).toBe("2026-06-30T21:00:00.000Z");
  });

  it("ends 'last month' on that month's own last instant", () => {
    const { from, to } = resolveRange("last_month", new Date("2026-07-14T12:00:00Z"));

    expect(from.toISOString()).toBe("2026-05-31T21:00:00.000Z"); // 00:00 Cairo, 1 June
    expect(to.toISOString()).toBe("2026-06-30T20:59:59.999Z"); // 23:59:59.999 Cairo, 30 June
  });

  it("rolls the previous month across a year boundary", () => {
    const { from } = resolveRange("last_month", new Date("2026-01-09T12:00:00Z"));
    expect(toDateInput(from)).toBe("2025-12-01");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   Filters
   ───────────────────────────────────────────────────────────────────────────── */
describe("filters work independently and together", () => {
  it("builds an `in` clause per selected list, and combines them", () => {
    const where = conversationWhere({
      from: new Date("2026-02-01"),
      to: new Date("2026-02-28"),
      department: ["sales", "operations"],
      teamId: [3, 4],
      agentId: [10],
      inboxId: [27],
      status: ["open", "pending"],
      label: ["vip"],
      sla: ["breached"],
      needsReply: true,
    });

    expect(where.department).toEqual({ in: ["sales", "operations"] });
    expect(where.teamCwId).toEqual({ in: [3, 4] });
    expect(where.assigneeCwId).toEqual({ in: [10] });
    expect(where.inboxCwId).toEqual({ in: [27] });
    expect(where.status).toEqual({ in: ["open", "pending"] });
    expect(where.labels).toEqual({ hasSome: ["vip"] });
    expect(where.slaFirstResponseState).toEqual({ in: ["breached"] });
    expect(where.needsReply).toBe(true);
    expect(where.createdAtCw).toEqual({ gte: new Date("2026-02-01"), lte: new Date("2026-02-28") });
  });

  it("drops the date bound for live-state queries and keeps every other filter", () => {
    const f = {
      from: new Date("2026-02-01"),
      to: new Date("2026-02-28"),
      teamId: [4],
      inboxId: [27],
    };
    const where = conversationWhere(f, { ignoreDate: true });

    // This is what makes current workload match Chatwoot.
    expect(where.createdAtCw).toBeUndefined();
    expect(where.teamCwId).toEqual({ in: [4] });
    expect(where.inboxCwId).toEqual({ in: [27] });
  });

  it("swaps a reversed range instead of silently returning nothing", () => {
    const f = parseFilters(
      new URLSearchParams({ from: "2026-02-28T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" }),
    );
    expect(f.from.getTime()).toBeLessThanOrEqual(f.to.getTime());
  });

  it("round-trips every filter through the URL, so drill-downs and exports keep them", () => {
    const f = parseFilters(
      new URLSearchParams({
        from: "2026-02-01T00:00:00.000Z",
        to: "2026-02-28T00:00:00.000Z",
        department: "sales,operations",
        teamId: "3,4",
        agentId: "10",
        inboxId: "27",
        status: "open",
        label: "vip,complaint",
        sla: "breached",
        needsReply: "true",
        activeOnly: "true",
      }),
    );
    const qs = new URLSearchParams(filtersToQuery(f));

    expect(qs.get("department")).toBe("sales,operations");
    expect(qs.get("teamId")).toBe("3,4");
    expect(qs.get("label")).toBe("vip,complaint");
    expect(qs.get("sla")).toBe("breached");
    expect(qs.get("needsReply")).toBe("true");
    expect(qs.get("activeOnly")).toBe("true");
    expect(qs.get("from")).toBe("2026-02-01T00:00:00.000Z");
  });

  it("drops blanks, 'all' and duplicates from a selection", () => {
    const f = parseFilters(new URLSearchParams({ department: "sales,,all,sales,operations", agentId: "10,abc,10" }));
    expect(f.department).toEqual(["sales", "operations"]);
    expect(f.agentId).toEqual([10]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   The query layer: live is unbounded, period metrics are bounded.
   ───────────────────────────────────────────────────────────────────────────── */
const db = vi.hoisted(() => ({
  agentWhere: undefined as unknown,
  currentWhere: undefined as unknown,
  intervalWhere: undefined as unknown,
  createdWhere: undefined as unknown,
  resolvedWhere: undefined as unknown,
  conversationCalls: 0,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    agent: {
      findMany: async ({ where }: { where: unknown }) => {
        db.agentWhere = where;
        return ROSTER;
      },
    },
    conversation: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        db.conversationCalls++;
        if (where.status) db.currentWhere = where;
        else if (where.resolvedAt) db.resolvedWhere = where;
        else db.createdWhere = where;
        return [];
      },
    },
    assignmentInterval: {
      findMany: async ({ where }: { where: unknown }) => {
        db.intervalWhere = where;
        return [];
      },
    },
  },
}));

const { getAgentLeaderboard } = await import("@/lib/reporting/agents");

describe("getAgentLeaderboard query", () => {
  beforeEach(() => {
    db.conversationCalls = 0;
  });

  it("queries live workload with NO date bound, and period metrics with one", async () => {
    const from = new Date("2026-02-01T00:00:00.000Z");
    const to = new Date("2026-02-28T23:59:59.999Z");

    await getAgentLeaderboard({ from, to, teamId: [4] });

    // Live: active statuses, team filter kept, date dropped. This is the fix.
    const current = db.currentWhere as Record<string, unknown>;
    expect(current.status).toEqual({ in: ["open", "pending", "snoozed"] });
    expect(current.teamCwId).toEqual({ in: [4] });
    expect(current.createdAtCw).toBeUndefined();

    // Assignment activity: bounded by startedAt, NOT by conversation creation.
    const intervals = db.intervalWhere as Record<string, unknown>;
    expect(intervals.startedAt).toEqual({ gte: from, lte: to });

    // Acquisition: the only query that uses createdAtCw.
    const created = db.createdWhere as Record<string, unknown>;
    expect(created.createdAtCw).toEqual({ gte: from, lte: to });

    // Resolved: anchored on resolvedAt.
    const resolved = db.resolvedWhere as Record<string, unknown>;
    expect(resolved.resolvedAt).toEqual({ gte: from, lte: to });
    expect(resolved.createdAtCw).toBeUndefined();
  });

  it("narrows to the selected agents", async () => {
    await getAgentLeaderboard({ from: new Date("2026-02-01"), to: new Date("2026-02-28"), agentId: [10, 20] });

    expect(db.agentWhere).toEqual({ id: { in: [10, 20] } });
    expect((db.intervalWhere as Record<string, unknown>).assigneeCwId).toEqual({ in: [10, 20] });
  });
});
