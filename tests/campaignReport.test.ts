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
  replyWhere: undefined as unknown,
  countWhere: undefined as unknown,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    campaignJob: {
      findMany: async () => db.jobs,
      count: async () => db.jobs.length,
    },
    campaignReply: {
      findMany: async ({ where }: { where: unknown }) => {
        db.replyWhere = where;
        return db.replies;
      },
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
    const where = db.replyWhere as { replyAt?: { gte?: Date; lte?: Date } };
    expect(where.replyAt?.gte).toBeUndefined();
    expect(where.replyAt?.lte).toEqual(FILTERS.to);
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
