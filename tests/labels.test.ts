import { describe, it, expect } from "vitest";
import { buildLabelsReport, type LabelConversation, type LabelRecord } from "@/lib/reporting/labels";
import { parseFilters, conversationWhere, filtersToQuery } from "@/lib/reporting/filters";

const ROSTER: LabelRecord[] = [
  { title: "vip", color: "#0B6BF0", description: null },
  { title: "complaint", color: "#F43F5E", description: null },
  { title: "follow-up", color: "#10B981", description: null }, // never used
];

function conv(over: Partial<LabelConversation> = {}): LabelConversation {
  return {
    labels: [],
    status: "open",
    needsReply: false,
    handledByHuman: true,
    responseSeconds: null,
    conversationDurationSeconds: null,
    slaFirstResponseBreached: false,
    lastMessageAt: null,
    ...over,
  };
}

const report = (conversations: LabelConversation[], activeOnly = false) =>
  buildLabelsReport({ labels: ROSTER, conversations, activeOnly });

describe("labels report — every label, always", () => {
  it("includes a label with no conversations, at zero", () => {
    const { rows } = report([conv({ labels: ["vip"] })]);

    expect(rows.map((r) => r.title).sort()).toEqual(["complaint", "follow-up", "vip"]);

    const idle = rows.find((r) => r.title === "follow-up")!;
    expect(idle.hasActivity).toBe(false);
    expect(idle.conversations).toBe(0);
    expect(idle.open).toBe(0);
    expect(idle.slaBreaches).toBe(0);
    expect(idle.avgResponseSeconds).toBeNull();
    expect(idle.share).toBe(0);
  });

  it("keeps every label when the period is empty", () => {
    const { rows, summary } = report([]);
    expect(rows).toHaveLength(3);
    expect(summary.totalLabels).toBe(3);
    expect(summary.activeLabels).toBe(0);
    expect(summary.conversations).toBe(0);
  });

  it("hides idle labels only when activeOnly is on", () => {
    const conversations = [conv({ labels: ["vip"] })];
    expect(report(conversations).rows).toHaveLength(3);

    const filtered = report(conversations, true);
    expect(filtered.rows.map((r) => r.title)).toEqual(["vip"]);
    // The toggle hides rows; it does not rewrite the roster.
    expect(filtered.summary.totalLabels).toBe(3);
    expect(filtered.summary.activeLabels).toBe(1);
  });

  it("still reports a label applied in Chatwoot but missing from the roster", () => {
    const { rows } = report([conv({ labels: ["deleted-label"] })]);
    expect(rows.find((r) => r.title === "deleted-label")?.conversations).toBe(1);
  });

  it("keeps the label's Chatwoot colour", () => {
    const { rows } = report([conv({ labels: ["vip"] })]);
    expect(rows.find((r) => r.title === "vip")!.color).toBe("#0B6BF0");
  });
});

describe("labels report — a conversation can carry several", () => {
  it("counts one conversation under EVERY label it holds", () => {
    // This is the opposite of the team rule. A conversation genuinely belongs to
    // each of its labels, so it counts in each — it is not a double-count bug.
    const { rows, summary } = report([conv({ labels: ["vip", "complaint"] })]);

    expect(rows.find((r) => r.title === "vip")!.conversations).toBe(1);
    expect(rows.find((r) => r.title === "complaint")!.conversations).toBe(1);

    // The rows sum to 2, but there is only ONE conversation — the summary must
    // report the real total, or the screen would claim double the traffic.
    const rowSum = rows.reduce((n, r) => n + r.conversations, 0);
    expect(rowSum).toBe(2);
    expect(summary.conversations).toBe(1);
  });

  it("counts conversations with no label at all in `unlabeled`", () => {
    const { rows, summary } = report([conv({ labels: ["vip"] }), conv({ labels: [] }), conv({ labels: [] })]);

    expect(summary.unlabeled).toBe(2);
    expect(summary.conversations).toBe(3);
    expect(rows.find((r) => r.title === "vip")!.conversations).toBe(1);
  });

  it("computes share against the real conversation total, not the row sum", () => {
    const { rows } = report([
      conv({ labels: ["vip", "complaint"] }),
      conv({ labels: ["vip"] }),
      conv({ labels: [] }),
      conv({ labels: [] }),
    ]);

    // vip is on 2 of the 4 conversations.
    expect(rows.find((r) => r.title === "vip")!.share).toBe(0.5);
    expect(rows.find((r) => r.title === "complaint")!.share).toBe(0.25);
  });

  it("aggregates the metric set per label", () => {
    const { rows, summary } = report([
      conv({
        labels: ["vip"],
        status: "open",
        needsReply: true,
        responseSeconds: 100,
        slaFirstResponseBreached: true,
        lastMessageAt: new Date("2026-07-10T09:00:00Z"),
      }),
      conv({
        labels: ["vip"],
        status: "resolved",
        responseSeconds: 300,
        conversationDurationSeconds: 3600,
        lastMessageAt: new Date("2026-07-12T09:00:00Z"),
      }),
      conv({ labels: ["vip"], status: "pending", handledByHuman: false, responseSeconds: 500 }),
    ]);

    const vip = rows.find((r) => r.title === "vip")!;
    expect(vip.conversations).toBe(3);
    expect(vip.open).toBe(1);
    expect(vip.pending).toBe(1);
    expect(vip.resolved).toBe(1);
    expect(vip.replied).toBe(2);
    expect(vip.needsReply).toBe(1);
    expect(vip.slaBreaches).toBe(1);
    expect(vip.avgResponseSeconds).toBe(300); // (100+300+500)/3
    expect(vip.medianResponseSeconds).toBe(300);
    expect(vip.avgResolutionSeconds).toBe(3600);
    expect(vip.lastActivityAt).toEqual(new Date("2026-07-12T09:00:00Z"));

    // The summary counts each conversation once, whatever its labels.
    expect(summary.slaBreaches).toBe(1);
    expect(summary.avgResponseSeconds).toBe(300);
  });

  it("sorts busiest first and leaves idle labels at the bottom", () => {
    const { rows } = report([
      conv({ labels: ["complaint"] }),
      conv({ labels: ["complaint"] }),
      conv({ labels: ["vip"] }),
    ]);
    expect(rows.map((r) => r.title)).toEqual(["complaint", "vip", "follow-up"]);
  });
});

describe("label filter", () => {
  it("matches a conversation carrying ANY of the selected labels", () => {
    const where = conversationWhere({
      from: new Date("2026-07-01"),
      to: new Date("2026-07-31"),
      label: ["vip", "complaint"],
    });

    expect(where.labels).toEqual({ hasSome: ["vip", "complaint"] });
  });

  it("parses and round-trips a multi-label selection", () => {
    const f = parseFilters(new URLSearchParams({ label: "vip,complaint" }));
    expect(f.label).toEqual(["vip", "complaint"]);

    const qs = new URLSearchParams(filtersToQuery(f));
    expect(qs.get("label")).toBe("vip,complaint");
  });

  it("applies no label filter when none are selected", () => {
    const where = conversationWhere({ from: new Date("2026-07-01"), to: new Date("2026-07-31") });
    expect(where.labels).toBeUndefined();
  });
});
