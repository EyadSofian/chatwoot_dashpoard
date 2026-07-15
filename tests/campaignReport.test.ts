import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The bug this locks down:
 *
 * campaignSource used to be derived from the `api_campaign_reply_team_id`
 * conversation attribute. The uploader (campaignMarkers.js) only writes that
 * attribute when `replyAssignment.mode === 'on_reply_team'`, so for any campaign
 * without reply auto-assignment it was absent → source came out null → the report
 * keyed replies as ":label" while jobs keyed as "sales:label" → Sales and
 * Operations both showed 0 replies even though customers had answered.
 *
 * Source now comes from CampaignJob.sourceKey, and replies join on campaignJobId.
 */

const db = vi.hoisted(() => ({
  jobs: [] as Record<string, unknown>[],
  replies: [] as Record<string, unknown>[],
  recipientGroups: [] as Record<string, unknown>[],
  replySql: undefined as { text: string; values: unknown[] } | undefined,
  countWhere: undefined as unknown,
}));

/** Pull the parameterised text + bound values off a Prisma.Sql instance. */
function sqlParts(query: unknown): { text: string; values: unknown[] } {
  const q = query as { text?: string; sql?: string; strings?: string[]; values?: unknown[] };
  return { text: q.text ?? q.sql ?? (q.strings ?? []).join(" ? "), values: q.values ?? [] };
}

vi.mock("@/lib/db", () => ({
  prisma: {
    campaignJob: {
      findMany: async () => db.jobs,
      count: async () => db.jobs.length,
    },
    // Reply metrics are aggregated in PostgreSQL now. The fake runs the same
    // aggregation over the in-memory rows — distinct repliers, NULL-skipping
    // average, cohort bound on replyAt — so the tests keep asserting SEMANTICS,
    // not call shapes.
    $queryRaw: async (query: unknown) => {
      const parts = sqlParts(query);
      db.replySql = parts;
      const to = parts.values.find((v): v is Date => v instanceof Date) ?? null;
      const ids = new Set(parts.values.filter((v): v is bigint => typeof v === "bigint").map(String));

      const perJob = new Map<string, Record<string, unknown>[]>();
      for (const r of db.replies) {
        const jobKey = String(r.campaignJobId);
        if (ids.size && !ids.has(jobKey)) continue;
        const replyAt = r.replyAt as Date | undefined;
        if (to && replyAt && replyAt.getTime() > to.getTime()) continue;
        const list = perJob.get(jobKey) ?? [];
        list.push(r);
        perJob.set(jobKey, list);
      }

      return [...perJob.entries()].map(([jobKey, list]) => {
        const seconds = list
          .map((r) => r.responseSeconds)
          .filter((s): s is number => typeof s === "number");
        return {
          campaignJobId: BigInt(jobKey),
          customerReplies: BigInt(new Set(list.map((r) => r.conversationCwId)).size),
          teamReplied: BigInt(list.filter((r) => r.firstAgentReplyAt != null).length),
          avgTeamResponseSeconds: seconds.length ? seconds.reduce((a, b) => a + b, 0) / seconds.length : null,
          unassigned: BigInt(list.filter((r) => r.assigned === false).length),
          agents: [...new Set(list.map((r) => r.assigneeName).filter((n): n is string => typeof n === "string"))],
        };
      });
    },
    campaignReply: {
      count: async ({ where }: { where: unknown }) => {
        db.countWhere = where;
        return 7;
      },
    },
    campaignRecipient: {
      groupBy: async () => db.recipientGroups,
    },
    syncRun: {
      findFirst: async () => ({ startedAt: new Date("2026-07-14T08:00:00Z") }),
    },
  },
}));

const { getCampaigns } = await import("@/lib/reporting/campaigns");

const FILTERS = { from: new Date("2026-07-01"), to: new Date("2026-07-31") };

function job(over: Record<string, unknown>) {
  return {
    id: 1n,
    sourceKey: "sales",
    jobId: "job-a",
    labelName: "july_promo",
    originalLabelName: "July Promo",
    templateName: "promo_v2",
    operatorName: "منى",
    inboxName: "WhatsApp",
    status: "completed",
    statusBucket: "completed",
    createdAtApp: new Date("2026-07-05"),
    reconciledAt: new Date("2026-07-14"),
    total: 100,
    sent: 100,
    failed: 0,
    skipped: 0,
    deliveryFailuresCount: 0,
    ...over,
  };
}

describe("campaign report", () => {
  beforeEach(() => {
    db.jobs = [];
    db.replies = [];
    db.recipientGroups = [];
    db.replySql = undefined;
    db.countWhere = undefined;
  });

  it("keeps sales and operations separate, with replies, and no team marker anywhere", async () => {
    db.jobs = [job({ id: 1n, sourceKey: "sales", jobId: "s1" }), job({ id: 2n, sourceKey: "operations", jobId: "o1" })];
    db.replies = [
      { campaignJobId: 1n, conversationCwId: 11, assigned: true, assigneeName: "منى", responseSeconds: 120, firstAgentReplyAt: new Date() },
      { campaignJobId: 1n, conversationCwId: 12, assigned: true, assigneeName: "أحمد", responseSeconds: 300, firstAgentReplyAt: new Date() },
      { campaignJobId: 2n, conversationCwId: 22, assigned: false, assigneeName: null, responseSeconds: null, firstAgentReplyAt: null },
    ];

    const { rows, totals } = await getCampaigns(FILTERS);

    const sales = rows.find((r) => r.jobId === "s1")!;
    const ops = rows.find((r) => r.jobId === "o1")!;

    expect(sales.sourceKey).toBe("sales");
    expect(ops.sourceKey).toBe("operations");

    // The regression: these used to be 0.
    expect(sales.customerReplies).toBe(2);
    expect(ops.customerReplies).toBe(1);

    expect(sales.replyRate).toBeCloseTo(0.02); // 2 / 100
    expect(sales.teamReplied).toBe(2);
    expect(sales.avgTeamResponseSeconds).toBe(210);
    expect(ops.unassigned).toBe(1);

    expect(totals.customerReplies).toBe(3);
  });

  it("does not merge two jobs that share a label", async () => {
    db.jobs = [
      job({ id: 1n, jobId: "job-a", labelName: "july_promo" }),
      job({ id: 2n, jobId: "job-b", labelName: "july_promo" }), // same label, different send
    ];
    db.replies = [
      { campaignJobId: 1n, conversationCwId: 11, assigned: true, assigneeName: null, responseSeconds: null, firstAgentReplyAt: null },
      { campaignJobId: 2n, conversationCwId: 99, assigned: true, assigneeName: null, responseSeconds: null, firstAgentReplyAt: null },
    ];

    const { rows } = await getCampaigns(FILTERS);

    expect(rows.find((r) => r.jobId === "job-a")!.customerReplies).toBe(1);
    expect(rows.find((r) => r.jobId === "job-b")!.customerReplies).toBe(1);
  });

  it("counts the same customer once per campaign, not once overall", async () => {
    db.jobs = [job({ id: 1n, jobId: "job-a" }), job({ id: 2n, jobId: "job-b" })];
    // Conversation 42 was messaged by both campaigns and replied to both.
    db.replies = [
      { campaignJobId: 1n, conversationCwId: 42, assigned: true, assigneeName: null, responseSeconds: null, firstAgentReplyAt: null },
      { campaignJobId: 2n, conversationCwId: 42, assigned: true, assigneeName: null, responseSeconds: null, firstAgentReplyAt: null },
    ];

    const { rows, totals } = await getCampaigns(FILTERS);

    expect(rows.find((r) => r.jobId === "job-a")!.customerReplies).toBe(1);
    expect(rows.find((r) => r.jobId === "job-b")!.customerReplies).toBe(1);
    expect(totals.customerReplies).toBe(2);
  });

  it("counts a customer who replied twice to one campaign as one reply", async () => {
    db.jobs = [job({ id: 1n, jobId: "job-a" })];
    db.replies = [
      { campaignJobId: 1n, conversationCwId: 42, assigned: true, assigneeName: null, responseSeconds: null, firstAgentReplyAt: null },
      { campaignJobId: 1n, conversationCwId: 42, assigned: true, assigneeName: null, responseSeconds: null, firstAgentReplyAt: null },
    ];

    const { rows } = await getCampaigns(FILTERS);
    expect(rows[0]!.customerReplies).toBe(1); // distinct conversations
  });

  it("shows 0 and 0.0%, never a dash, when nobody replied", async () => {
    db.jobs = [job({ id: 1n, jobId: "job-a" })];
    db.replies = [];

    const { rows } = await getCampaigns(FILTERS);

    expect(rows[0]!.customerReplies).toBe(0);
    expect(rows[0]!.replyRate).toBe(0);
    expect(rows[0]!.dataState).toBe("no_replies");
  });

  it("says 'not reconciled' instead of pretending a campaign got zero replies", async () => {
    db.jobs = [job({ id: 1n, jobId: "job-a", reconciledAt: null })];
    db.replies = [];

    const { rows } = await getCampaigns(FILTERS);
    expect(rows[0]!.dataState).toBe("not_reconciled");
  });

  it("counts a campaign's replies through the end of the window, not only its send day", async () => {
    db.jobs = [job({ id: 1n, jobId: "job-a" })];
    await getCampaigns(FILTERS);

    // Cohort: no lower bound on replyAt. A campaign sent on the 30th whose
    // replies land on the 31st is not a campaign with a 0% reply rate.
    const text = db.replySql!.text;
    expect(text).toContain('r."replyAt" <=');
    expect(text).not.toContain('r."replyAt" >=');
    expect(db.replySql!.values).toContainEqual(FILTERS.to);

    // And the cohort bound actually filters: a reply after the window is out.
    db.replies = [
      { campaignJobId: 1n, conversationCwId: 1, assigned: true, assigneeName: null, responseSeconds: null, firstAgentReplyAt: null, replyAt: new Date("2026-07-20") },
      { campaignJobId: 1n, conversationCwId: 2, assigned: true, assigneeName: null, responseSeconds: null, firstAgentReplyAt: null, replyAt: new Date("2026-08-05") },
    ];
    const { rows } = await getCampaigns(FILTERS);
    expect(rows[0]!.customerReplies).toBe(1);
  });

  it("keeps 'replies that landed this period' as a separate volume KPI", async () => {
    db.jobs = [job({ id: 1n, jobId: "job-a" })];
    const { totals } = await getCampaigns(FILTERS);

    expect(totals.repliesInPeriod).toBe(7);
    // That one IS windowed on both sides, and only counts precise rows.
    const where = db.countWhere as { replyAt?: { gte?: Date; lte?: Date }; correlationMethod?: string };
    expect(where.replyAt?.gte).toEqual(FILTERS.from);
    expect(where.correlationMethod).toBe("message_id");
  });

  it("surfaces recipients that could not be tied to a Chatwoot message", async () => {
    db.jobs = [job({ id: 1n, jobId: "job-a" })];
    db.recipientGroups = [
      { campaignJobId: 1n, correlationState: "matched", _count: { _all: 80 } },
      { campaignJobId: 1n, correlationState: "message_missing", _count: { _all: 20 } },
    ];

    const { rows, totals } = await getCampaigns(FILTERS);

    expect(rows[0]!.matchedRecipients).toBe(80);
    expect(rows[0]!.unmatched).toBe(20);
    expect(totals.unmatched).toBe(20);
  });
});
