import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildAgentLeaderboard,
  type AgentConversation,
  type AgentInterval,
  type AgentRecord,
} from "@/lib/reporting/agents";
import { resolveRange, parseDateInput, toDateInput } from "@/lib/dateRange";
import { parseFilters, filtersToQuery } from "@/lib/reporting/filters";

/* ─────────────────────────────────────────────────────────────────────────────
   The roster: three agents on the Chatwoot account. Only two of them touched a
   conversation in the window — the third is the one the old report dropped.
   ───────────────────────────────────────────────────────────────────────────── */
const ROSTER: AgentRecord[] = [
  { id: 10, name: "منى عبد الرحمن", email: "mona@engosoft.com", availability: "online" },
  { id: 20, name: "أحمد سيف", email: "ahmed@engosoft.com", availability: "offline" },
  { id: 30, name: "نورهان علي", email: "nour@engosoft.com", availability: "offline" },
];

function conv(over: Partial<AgentConversation> & { assigneeCwId: number }): AgentConversation {
  return {
    assigneeName: null,
    status: "open",
    needsReply: false,
    handledByHuman: true,
    unreadCount: 0,
    slaFirstResponseBreached: false,
    ...over,
  };
}

const interval = (assigneeCwId: number, responseSeconds: number): AgentInterval => ({
  assigneeCwId,
  responseSeconds,
  responded: true,
});

describe("agents leaderboard — every agent, always", () => {
  it("includes an agent with no conversations, at zero", () => {
    const { rows } = buildAgentLeaderboard({
      agents: ROSTER,
      conversations: [conv({ assigneeCwId: 10 })],
      intervals: [interval(10, 120)],
    });

    expect(rows.map((r) => r.agentId).sort()).toEqual([10, 20, 30]);

    const idle = rows.find((r) => r.agentId === 30)!;
    expect(idle.hasActivity).toBe(false);
    expect(idle.assigned).toBe(0);
    expect(idle.replied).toBe(0);
    expect(idle.needsReply).toBe(0);
    expect(idle.open).toBe(0);
    expect(idle.resolved).toBe(0);
    expect(idle.slaBreaches).toBe(0);
    // No data is not the same as "answered in zero seconds".
    expect(idle.avgResponseSeconds).toBeNull();
    expect(idle.medianResponseSeconds).toBeNull();
    expect(idle.maxResponseSeconds).toBeNull();
  });

  it("keeps every agent when the period has no conversations at all", () => {
    const { rows, summary } = buildAgentLeaderboard({ agents: ROSTER, conversations: [], intervals: [] });

    expect(rows).toHaveLength(3);
    expect(rows.every((r) => !r.hasActivity && r.assigned === 0)).toBe(true);
    expect(summary.totalAgents).toBe(3);
    expect(summary.activeAgents).toBe(0);
    expect(summary.avgResponseSeconds).toBeNull();
  });

  it("hides idle agents only when activeOnly is on", () => {
    const input = {
      agents: ROSTER,
      conversations: [conv({ assigneeCwId: 10 }), conv({ assigneeCwId: 20 })],
      intervals: [],
    };

    expect(buildAgentLeaderboard(input).rows).toHaveLength(3);

    const filtered = buildAgentLeaderboard({ ...input, activeOnly: true });
    expect(filtered.rows.map((r) => r.agentId).sort()).toEqual([10, 20]);
    // The summary still describes the whole roster — the toggle hides rows,
    // it does not change the facts.
    expect(filtered.summary.totalAgents).toBe(3);
    expect(filtered.summary.activeAgents).toBe(2);
  });

  it("still reports an assignee who is missing from the roster", () => {
    // e.g. the agent was deleted in Chatwoot, or entities were never synced.
    const { rows } = buildAgentLeaderboard({
      agents: [],
      conversations: [conv({ assigneeCwId: 99, assigneeName: "موظف قديم" })],
      intervals: [interval(99, 60)],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.agentId).toBe(99);
    expect(rows[0]!.name).toBe("موظف قديم");
    expect(rows[0]!.avgResponseSeconds).toBe(60);
  });

  it("counts statuses and SLA breaches per agent", () => {
    const { rows, summary } = buildAgentLeaderboard({
      agents: ROSTER,
      conversations: [
        conv({ assigneeCwId: 10, status: "open", needsReply: true, unreadCount: 3, slaFirstResponseBreached: true }),
        conv({ assigneeCwId: 10, status: "resolved" }),
        conv({ assigneeCwId: 10, status: "pending", handledByHuman: false }),
        conv({ assigneeCwId: 20, status: "resolved", slaFirstResponseBreached: true }),
      ],
      intervals: [],
    });

    const mona = rows.find((r) => r.agentId === 10)!;
    expect(mona.assigned).toBe(3);
    expect(mona.replied).toBe(2); // the pending one was never handled by a human
    expect(mona.needsReply).toBe(1);
    expect(mona.open).toBe(1);
    expect(mona.resolved).toBe(1);
    expect(mona.pending).toBe(1);
    expect(mona.unread).toBe(1);
    expect(mona.slaBreaches).toBe(1);

    expect(summary.slaBreaches).toBe(2);
    expect(summary.activeAgents).toBe(2);
  });

  it("sorts busiest first and leaves idle agents at the bottom", () => {
    const { rows } = buildAgentLeaderboard({
      agents: ROSTER,
      conversations: [
        conv({ assigneeCwId: 20 }),
        conv({ assigneeCwId: 20 }),
        conv({ assigneeCwId: 10 }),
      ],
      intervals: [],
    });

    expect(rows.map((r) => r.agentId)).toEqual([20, 10, 30]);
  });
});

describe("agents leaderboard — response time", () => {
  it("averages the assignment→first-human-reply intervals for each agent", () => {
    const { rows, summary } = buildAgentLeaderboard({
      agents: ROSTER,
      conversations: [conv({ assigneeCwId: 10 }), conv({ assigneeCwId: 20 })],
      intervals: [interval(10, 100), interval(10, 200), interval(10, 600), interval(20, 60)],
    });

    const mona = rows.find((r) => r.agentId === 10)!;
    expect(mona.avgResponseSeconds).toBe(300); // (100+200+600)/3
    expect(mona.medianResponseSeconds).toBe(200);
    expect(mona.maxResponseSeconds).toBe(600);

    // Pooled across every interval in the window: (100+200+600+60)/4 = 240.
    expect(summary.avgResponseSeconds).toBe(240);
  });

  it("ignores assignments the agent never answered", () => {
    const { rows } = buildAgentLeaderboard({
      agents: ROSTER,
      conversations: [conv({ assigneeCwId: 10 })],
      intervals: [
        interval(10, 300),
        { assigneeCwId: 10, responseSeconds: null, responded: false }, // assigned, never replied
      ],
    });

    const mona = rows.find((r) => r.agentId === 10)!;
    expect(mona.avgResponseSeconds).toBe(300); // the silent assignment must not count as 0
    expect(mona.maxResponseSeconds).toBe(300);
  });

  it("leaves response time null for an agent who was assigned nothing", () => {
    const { rows } = buildAgentLeaderboard({
      agents: ROSTER,
      conversations: [conv({ assigneeCwId: 10 })],
      intervals: [interval(10, 300)],
    });

    const idle = rows.find((r) => r.agentId === 30)!;
    expect(idle.avgResponseSeconds).toBeNull();
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   Date range
   ───────────────────────────────────────────────────────────────────────────── */
describe("date range presets", () => {
  const now = new Date(2026, 6, 14, 15, 30); // 14 Jul 2026, local

  it("resolves 'today' from local midnight", () => {
    const { from, to } = resolveRange("today", now);
    expect(from.getHours()).toBe(0);
    expect(from.getDate()).toBe(14);
    expect(to.getTime()).toBe(now.getTime());
  });

  it("resolves rolling day windows", () => {
    const { from, to } = resolveRange("30d", now);
    expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(30);
  });

  it("resolves the current month from the 1st", () => {
    const { from } = resolveRange("this_month", now);
    expect(from.getDate()).toBe(1);
    expect(from.getMonth()).toBe(6); // July
    expect(from.getHours()).toBe(0);
  });

  it("resolves the previous month to its own last instant, not today", () => {
    const { from, to } = resolveRange("last_month", now);
    expect(from.getMonth()).toBe(5); // June
    expect(from.getDate()).toBe(1);
    expect(to.getMonth()).toBe(5); // still June — must not bleed into July
    expect(to.getDate()).toBe(30); // June has 30 days
    expect(to.getHours()).toBe(23);
  });

  it("rolls the previous month back across a year boundary", () => {
    const { from, to } = resolveRange("last_month", new Date(2026, 0, 9)); // 9 Jan 2026
    expect(from.getFullYear()).toBe(2025);
    expect(from.getMonth()).toBe(11); // December
    expect(to.getDate()).toBe(31);
  });

  it("round-trips a custom date through the picker format", () => {
    const parsed = parseDateInput("2026-03-05")!;
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(2);
    expect(parsed.getDate()).toBe(5);
    expect(parsed.getHours()).toBe(0);
    expect(toDateInput(parsed)).toBe("2026-03-05");

    // The "to" side must cover the whole day, or the last day gets cut off.
    const end = parseDateInput("2026-03-05", { endOfDay: true })!;
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it("rejects a malformed date instead of inventing one", () => {
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput("05/03/2026")).toBeNull();
    expect(toDateInput(null)).toBe("");
  });
});

describe("custom range reaches the report filters", () => {
  it("parses an arbitrary from/to out of the query string", () => {
    const f = parseFilters(
      new URLSearchParams({
        from: "2026-02-01T00:00:00.000Z",
        to: "2026-02-28T23:59:59.999Z",
        activeOnly: "true",
      }),
    );

    expect(f.from.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(f.to.toISOString()).toBe("2026-02-28T23:59:59.999Z");
    expect(f.activeOnly).toBe(true);
  });

  it("falls back to the last 30 days when no range is given", () => {
    const f = parseFilters(new URLSearchParams());
    const days = (f.to.getTime() - f.from.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
    expect(f.activeOnly).toBeUndefined();
  });

  it("carries the range and activeOnly through to the CSV export link", () => {
    const f = parseFilters(
      new URLSearchParams({ from: "2026-02-01T00:00:00.000Z", to: "2026-02-28T00:00:00.000Z", activeOnly: "true" }),
    );
    const qs = new URLSearchParams(filtersToQuery(f));

    expect(qs.get("from")).toBe("2026-02-01T00:00:00.000Z");
    expect(qs.get("to")).toBe("2026-02-28T00:00:00.000Z");
    expect(qs.get("activeOnly")).toBe("true");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   The query layer: the roster must not be date-filtered, the metrics must be.
   ───────────────────────────────────────────────────────────────────────────── */
const db = vi.hoisted(() => ({
  agentWhere: undefined as unknown,
  conversationWhere: undefined as unknown,
  intervalWhere: undefined as unknown,
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
      findMany: async ({ where }: { where: unknown }) => {
        db.conversationWhere = where;
        return [conv({ assigneeCwId: 10 })];
      },
    },
    assignmentInterval: {
      findMany: async ({ where }: { where: unknown }) => {
        db.intervalWhere = where;
        return [interval(10, 240)];
      },
    },
  },
}));

const { getAgentLeaderboard } = await import("@/lib/reporting/agents");

describe("getAgentLeaderboard query", () => {
  beforeEach(() => {
    db.agentWhere = undefined;
    db.conversationWhere = undefined;
    db.intervalWhere = undefined;
  });

  it("reads the whole roster, then scopes only the metrics to the period", async () => {
    const from = new Date("2026-02-01T00:00:00.000Z");
    const to = new Date("2026-02-28T23:59:59.999Z");

    const { rows, summary } = await getAgentLeaderboard({ from, to });

    // The roster query carries no date bound — that is what keeps idle agents in.
    expect(db.agentWhere).toEqual({});

    // Metrics do carry it.
    expect(db.conversationWhere).toMatchObject({ createdAtCw: { gte: from, lte: to } });
    expect(db.intervalWhere).toMatchObject({ startedAt: { gte: from, lte: to }, responded: true });

    // All three agents come back; only the one with data has numbers.
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.agentId === 10)!.avgResponseSeconds).toBe(240);
    expect(rows.find((r) => r.agentId === 30)!.avgResponseSeconds).toBeNull();
    expect(summary.totalAgents).toBe(3);
    expect(summary.activeAgents).toBe(1);
  });

  it("narrows the roster to one agent when drilling into their page", async () => {
    await getAgentLeaderboard({ from: new Date("2026-02-01"), to: new Date("2026-02-28"), agentId: 20 });

    expect(db.agentWhere).toEqual({ id: 20 });
    expect(db.intervalWhere).toMatchObject({ assigneeCwId: 20 });
  });
});
