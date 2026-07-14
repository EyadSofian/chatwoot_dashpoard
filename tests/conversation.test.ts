import { describe, it, expect } from "vitest";
import { assembleConversation, type AssembleContext } from "@/lib/metrics/conversation";
import type { CwConversation, CwMessage } from "@/lib/chatwoot/types";

const d = (iso: string) => new Date(iso);

const ctx: AssembleContext = {
  botAgentIds: new Set([77]),
  botLabel: "needs-bot",
  // Business hours = 24/7 so business seconds equal wall-clock seconds here and
  // the assertions stay about the classifier, not the calendar.
  business: { timezone: "Africa/Cairo", startMinutes: 0, endMinutes: 1440, days: [0, 1, 2, 3, 4, 5, 6] },
  slaFirstResponseSeconds: 1800,
  slaResolutionSeconds: 86400,
  nearBreachRatio: 0.8,
  salesTeamId: "4",
  operationsTeamId: "3",
  now: d("2026-07-01T12:00:00Z"),
};

function conversation(over: Partial<CwConversation> = {}): CwConversation {
  return {
    id: 42,
    status: "open",
    created_at: "2026-07-01T10:00:00Z",
    inbox_id: 27,
    labels: [],
    custom_attributes: {},
    meta: { assignee: { id: 10, name: "Mona" }, team: { id: 4, name: "Sales" } },
    ...over,
  };
}

/** The noise an Engosoft conversation is full of — none of it is a human reply. */
const NOISE: CwMessage[] = [
  { id: 1, message_type: 0, private: false, created_at: "2026-07-01T10:01:00Z", sender: { id: 5, type: "contact" } },
  // private note from the assigned agent
  { id: 2, message_type: 1, private: true, created_at: "2026-07-01T10:02:00Z", sender: { id: 10, type: "user" } },
  // Fahd / Botpress
  { id: 3, message_type: 1, private: false, created_at: "2026-07-01T10:03:00Z", sender: { id: 900, type: "agent_bot" } },
  // automation rule
  {
    id: 4,
    message_type: 1,
    private: false,
    created_at: "2026-07-01T10:04:00Z",
    sender: null,
    content_attributes: { automation_rule_id: 12 },
  },
  // campaign template send, stamped with the assigned agent as sender
  {
    id: 5,
    message_type: 1,
    private: false,
    created_at: "2026-07-01T10:05:00Z",
    sender: { id: 10, type: "user" },
    content_attributes: { template_params: { name: "promo_july" } },
  },
];

/** The one message that actually counts. */
const HUMAN_REPLY: CwMessage = {
  id: 6,
  message_type: 1,
  private: false,
  created_at: "2026-07-01T10:10:00Z",
  content: "أهلاً بك",
  sender: { id: 10, type: "user", name: "Mona" },
};

describe("response time from assignment (end to end)", () => {
  it("measures assignment → first human reply, ignoring notes, bots, automation and templates", () => {
    const a = assembleConversation(conversation(), [...NOISE, HUMAN_REPLY], {
      ...ctx,
      assignmentEvents: [{ assigneeId: 10, at: d("2026-07-01T10:00:00Z") }],
    });

    // 10:00 assignment → 10:10 reply. The 10:02–10:05 noise must not shorten it.
    expect(a.responseMetric.assignedAt).toEqual(d("2026-07-01T10:00:00Z"));
    expect(a.responseMetric.firstReplyAt).toEqual(d("2026-07-01T10:10:00Z"));
    expect(a.responseMetric.responseSeconds).toBe(600);
    expect(a.responseMetric.assigneeCwId).toBe(10);

    expect(a.conversation.firstHumanReplyAt).toEqual(d("2026-07-01T10:10:00Z"));
    expect(a.conversation.handledByHuman).toBe(true);
    expect(a.conversation.responseSeconds).toBe(600);
  });

  it("does not treat an automation reply as human handling", () => {
    // Same thread, but the agent never actually replied.
    const a = assembleConversation(conversation(), NOISE, {
      ...ctx,
      assignmentEvents: [{ assigneeId: 10, at: d("2026-07-01T10:00:00Z") }],
    });

    expect(a.conversation.handledByHuman).toBe(false);
    expect(a.conversation.firstHumanReplyAt).toBeNull();
    expect(a.responseMetric.responseSeconds).toBeNull();
    expect(a.responseMetric.assignedAt).toEqual(d("2026-07-01T10:00:00Z"));
    // Customer spoke last (10:01) and nobody human answered → still needs a reply.
    expect(a.conversation.needsReply).toBe(true);
  });

  it("opens a fresh interval on reassignment and attributes the reply to the new agent", () => {
    const reply20: CwMessage = {
      id: 7,
      message_type: 1,
      private: false,
      created_at: "2026-07-01T10:40:00Z",
      sender: { id: 20, type: "user", name: "Ali" },
    };

    const a = assembleConversation(conversation({ meta: { assignee: { id: 20, name: "Ali" } } }), [...NOISE, reply20], {
      ...ctx,
      assignmentEvents: [
        { assigneeId: 10, at: d("2026-07-01T10:00:00Z") },
        { assigneeId: 20, at: d("2026-07-01T10:30:00Z") },
      ],
    });

    expect(a.assignmentIntervals).toHaveLength(2);
    expect(a.assignmentIntervals[0]!.responded).toBe(false); // agent 10 never replied
    expect(a.assignmentIntervals[1]!.assigneeId).toBe(20);
    expect(a.assignmentIntervals[1]!.responseSeconds).toBe(600); // 10:30 → 10:40

    expect(a.responseMetric.assigneeCwId).toBe(20);
    expect(a.responseMetric.responseSeconds).toBe(600);
  });

  it("breaches the first-response SLA when the human reply is slower than the target", () => {
    const late: CwMessage = { ...HUMAN_REPLY, created_at: "2026-07-01T11:00:00Z" }; // 60 min > 30 min target
    const a = assembleConversation(conversation(), [...NOISE, late], {
      ...ctx,
      assignmentEvents: [{ assigneeId: 10, at: d("2026-07-01T10:00:00Z") }],
    });

    expect(a.responseMetric.responseSeconds).toBe(3600);
    expect(a.conversation.slaFirstResponseBreached).toBe(true);
    expect(a.conversation.slaFirstResponseState).toBe("breached");
  });
});

describe("resolution segments (end to end)", () => {
  it("splits a resolve → reopen → resolve lifecycle into two segments", () => {
    const a = assembleConversation(conversation({ status: "resolved" }), [...NOISE, HUMAN_REPLY], {
      ...ctx,
      statusEvents: [
        { type: "resolved", at: d("2026-07-01T10:30:00Z") },
        { type: "reopened", at: d("2026-07-01T11:00:00Z") },
        { type: "resolved", at: d("2026-07-01T11:30:00Z") },
      ],
    });

    expect(a.resolutionSegments).toHaveLength(2);
    expect(a.resolutionSegments[0]!.durationSeconds).toBe(1800); // 10:00 → 10:30
    expect(a.resolutionSegments[1]!.durationSeconds).toBe(1800); // 11:00 → 11:30
    expect(a.conversation.conversationDurationSeconds).toBe(3600);
    expect(a.conversation.resolvedAt).toEqual(d("2026-07-01T11:30:00Z"));
  });
});

describe("campaign correlation (end to end)", () => {
  const campaignAttrs = {
    api_campaign_label: "july_promo",
    api_campaign_status: "sent",
    api_campaign_created_at: "2026-07-01T10:00:00Z",
    last_api_template: "promo_template_v2",
    api_sent_july_promo_promo_template_v2: "2026-07-01T10:00:00Z",
    api_campaign_reply_team_id: "4",
    api_campaign_reply_team_name: "Sales",
    api_campaign_reply_assignee_id: "10",
    api_campaign_reply_assignee_name: "Mona",
  };

  it("links the customer's campaign reply to the first human agent reply", () => {
    const a = assembleConversation(conversation({ custom_attributes: campaignAttrs }), [...NOISE, HUMAN_REPLY], ctx);

    expect(a.conversation.isCampaign).toBe(true);
    expect(a.conversation.campaignLabel).toBe("july_promo");
    expect(a.conversation.campaignSource).toBe("sales"); // reply team 4 → Sales app
    expect(a.conversation.campaignTemplate).toBe("promo_template_v2");

    const reply = a.campaignReply!;
    expect(reply.campaignLabel).toBe("july_promo");
    expect(reply.replyAt).toEqual(d("2026-07-01T10:01:00Z")); // the customer's incoming
    expect(reply.firstAgentReplyAt).toEqual(d("2026-07-01T10:10:00Z")); // NOT the 10:04 automation
    expect(reply.responseSeconds).toBe(540); // 10:01 → 10:10
    expect(reply.assigneeCwId).toBe(10);
    expect(reply.assigneeName).toBe("Mona");
  });

  it("records no campaign reply for a conversation with no campaign markers", () => {
    const a = assembleConversation(conversation(), [...NOISE, HUMAN_REPLY], ctx);
    expect(a.conversation.isCampaign).toBe(false);
    expect(a.campaignReply).toBeNull();
  });
});

describe("Fahd bot handoff", () => {
  it("flags bot involvement and measures handoff → first human reply", () => {
    const a = assembleConversation(
      conversation({ custom_attributes: { engosoft_bot_release: "2026-07-01T10:06:00Z" } }),
      [...NOISE, HUMAN_REPLY],
      ctx,
    );

    expect(a.conversation.botInvolved).toBe(true);
    const handoff = a.botHandoff!;
    expect(handoff.handoffAt).toEqual(d("2026-07-01T10:06:00Z"));
    expect(handoff.gotAgentReply).toBe(true);
    expect(handoff.firstAgentReplyAt).toEqual(d("2026-07-01T10:10:00Z"));
    expect(handoff.handoffToReplySeconds).toBe(240); // 10:06 → 10:10
    expect(handoff.reentry).toBe(true);
  });

  it("reports a handoff that no human ever picked up", () => {
    const a = assembleConversation(
      conversation({ custom_attributes: { engosoft_bot_release: "2026-07-01T10:06:00Z" } }),
      NOISE, // automation replied at 10:04, but that is not a human
      ctx,
    );

    const handoff = a.botHandoff!;
    expect(handoff.gotAgentReply).toBe(false);
    expect(handoff.firstAgentReplyAt).toBeNull();
    expect(handoff.handoffToReplySeconds).toBeNull();
  });
});
