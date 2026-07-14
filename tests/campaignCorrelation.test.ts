import { describe, it, expect } from "vitest";
import {
  correlateReply,
  findSentAt,
  jobDedupeKey,
  attrDedupeKey,
  type CorrelationMessage,
} from "@/lib/campaigns/correlate";
import { classifyMessage } from "@/lib/metrics/humanReply";
import type { CwMessage } from "@/lib/chatwoot/types";

const d = (iso: string) => new Date(iso);

/** Build a correlation message straight from the real classifier — no re-deriving rules. */
function msg(raw: Partial<CwMessage> & { id: number }): CorrelationMessage {
  const c = classifyMessage({ private: false, ...raw } as CwMessage, new Set([77]));
  return {
    chatwootId: c.chatwootId,
    createdAt: c.createdAt,
    isCustomerIncoming: c.isCustomerIncoming,
    isHumanReply: c.isHumanReply,
    senderId: c.senderId,
    senderName: c.senderName,
  };
}

const TEMPLATE = msg({
  id: 500,
  message_type: 1,
  created_at: "2026-07-01T10:00:00Z",
  sender: { id: 10, type: "user" },
  content_attributes: { template_params: { name: "promo" } },
});

const CUSTOMER_BEFORE = msg({
  id: 490,
  message_type: 0,
  created_at: "2026-06-28T09:00:00Z",
  sender: { id: 5, type: "contact" },
});

const CUSTOMER_AFTER = msg({
  id: 510,
  message_type: 0,
  created_at: "2026-07-01T10:30:00Z",
  sender: { id: 5, type: "contact" },
});

const AGENT_REPLY = msg({
  id: 520,
  message_type: 1,
  created_at: "2026-07-01T10:45:00Z",
  sender: { id: 10, type: "user", name: "منى" },
});

describe("campaign reply correlation — anchored on the template message", () => {
  it("resolves sentAt from the message id the uploader recorded", () => {
    expect(findSentAt([TEMPLATE, CUSTOMER_AFTER], 500)).toEqual(d("2026-07-01T10:00:00Z"));
    expect(findSentAt([TEMPLATE], 999)).toBeNull(); // message not in the conversation
    expect(findSentAt([TEMPLATE], null)).toBeNull(); // uploader never recorded one
  });

  it("counts an incoming message AFTER the template as one reply", () => {
    const r = correlateReply({
      messages: [TEMPLATE, CUSTOMER_AFTER, AGENT_REPLY],
      sentAt: d("2026-07-01T10:00:00Z"),
      method: "message_id",
    });

    expect(r.replied).toBe(true);
    expect(r.replyAt).toEqual(d("2026-07-01T10:30:00Z"));
    expect(r.firstAgentReplyAt).toEqual(d("2026-07-01T10:45:00Z"));
    expect(r.responseSeconds).toBe(900); // 10:30 → 10:45
    expect(r.assigneeCwId).toBe(10);
    expect(r.confidence).toBe("high");
  });

  it("does NOT count an incoming message that predates the template", () => {
    // The contact was already chatting days earlier. That is not a reply to a
    // campaign that had not been sent yet — counting it would inflate the rate
    // of every campaign sent to an already-active contact.
    const r = correlateReply({
      messages: [CUSTOMER_BEFORE, TEMPLATE],
      sentAt: d("2026-07-01T10:00:00Z"),
      method: "message_id",
    });

    expect(r.replied).toBe(false);
    expect(r.replyAt).toBeNull();
  });

  it("takes the FIRST incoming after the send when the customer sent several", () => {
    const second = msg({
      id: 511,
      message_type: 0,
      created_at: "2026-07-01T11:00:00Z",
      sender: { id: 5, type: "contact" },
    });

    const r = correlateReply({
      messages: [CUSTOMER_BEFORE, TEMPLATE, CUSTOMER_AFTER, second],
      sentAt: d("2026-07-01T10:00:00Z"),
      method: "message_id",
    });

    expect(r.replyAt).toEqual(d("2026-07-01T10:30:00Z"));
  });

  it("reports 'sent, no answer' rather than inventing a reply", () => {
    const r = correlateReply({ messages: [TEMPLATE], sentAt: d("2026-07-01T10:00:00Z"), method: "message_id" });
    expect(r.replied).toBe(false);
    expect(r.sentAt).toEqual(d("2026-07-01T10:00:00Z"));
  });

  it("is unmatched when the template message cannot be found", () => {
    const r = correlateReply({ messages: [CUSTOMER_AFTER], sentAt: null, method: "message_id" });
    expect(r.method).toBe("unmatched");
    expect(r.replied).toBe(false);
  });

  it("marks an attribute-derived correlation as low confidence", () => {
    const r = correlateReply({
      messages: [TEMPLATE, CUSTOMER_AFTER],
      sentAt: d("2026-07-01T10:00:00Z"),
      method: "attribute_fallback",
    });

    expect(r.replied).toBe(true);
    expect(r.method).toBe("attribute_fallback");
    // Keeps approximate rows out of the precise numbers.
    expect(r.confidence).toBe("low");
  });
});

describe("what does NOT count as a customer reply or a human answer", () => {
  const cases: { name: string; message: CorrelationMessage }[] = [
    {
      name: "the campaign template itself",
      message: TEMPLATE,
    },
    {
      name: "a Fahd/Botpress message",
      message: msg({
        id: 530,
        message_type: 1,
        created_at: "2026-07-01T10:10:00Z",
        sender: { id: 900, type: "agent_bot" },
      }),
    },
    {
      name: "a bot identified by configured id",
      message: msg({
        id: 531,
        message_type: 1,
        created_at: "2026-07-01T10:10:00Z",
        sender: { id: 77, type: "user" },
      }),
    },
    {
      name: "an automation-rule message",
      message: msg({
        id: 532,
        message_type: 1,
        created_at: "2026-07-01T10:10:00Z",
        sender: null,
        content_attributes: { automation_rule_id: 3 },
      }),
    },
    {
      name: "a private note",
      message: msg({
        id: 533,
        message_type: 1,
        private: true,
        created_at: "2026-07-01T10:10:00Z",
        sender: { id: 10, type: "user" },
      }),
    },
    {
      name: "an activity message",
      message: msg({ id: 534, message_type: 2, created_at: "2026-07-01T10:10:00Z" }),
    },
  ];

  for (const c of cases) {
    it(`ignores ${c.name}`, () => {
      expect(c.message.isCustomerIncoming).toBe(false);
      expect(c.message.isHumanReply).toBe(false);
    });
  }

  it("does not let a bot answer stand in for the team's response", () => {
    const bot = msg({
      id: 540,
      message_type: 1,
      created_at: "2026-07-01T10:35:00Z",
      sender: { id: 900, type: "agent_bot" },
    });

    const r = correlateReply({
      messages: [TEMPLATE, CUSTOMER_AFTER, bot],
      sentAt: d("2026-07-01T10:00:00Z"),
      method: "message_id",
    });

    expect(r.replied).toBe(true); // the customer did reply
    expect(r.firstAgentReplyAt).toBeNull(); // but no human answered
    expect(r.responseSeconds).toBeNull();
  });

  it("measures to the first HUMAN message, skipping the bot that answered first", () => {
    const bot = msg({
      id: 541,
      message_type: 1,
      created_at: "2026-07-01T10:31:00Z",
      sender: { id: 900, type: "agent_bot" },
    });

    const r = correlateReply({
      messages: [TEMPLATE, CUSTOMER_AFTER, bot, AGENT_REPLY],
      sentAt: d("2026-07-01T10:00:00Z"),
      method: "message_id",
    });

    expect(r.firstAgentReplyAt).toEqual(d("2026-07-01T10:45:00Z"));
    expect(r.responseSeconds).toBe(900); // not the 60s the bot took
  });
});

describe("keys — different sends never merge", () => {
  it("keeps the same customer in two different campaigns apart", () => {
    // Same conversation, two jobs. The old key was (conversationCwId, label),
    // which collapsed these into one row and lost a reply.
    const a = jobDedupeKey("job-a", 42);
    const b = jobDedupeKey("job-b", 42);
    expect(a).not.toBe(b);
  });

  it("keeps two jobs that share a label apart", () => {
    // Labels are reused across campaigns; the job id is what is unique.
    expect(jobDedupeKey("job-a", 42)).not.toBe(jobDedupeKey("job-b", 42));
    expect(attrDedupeKey(42, "july_promo")).toBe(attrDedupeKey(42, "july_promo"));
  });

  it("is stable across runs, so a second sync cannot double count", () => {
    expect(jobDedupeKey("job-a", 42)).toBe(jobDedupeKey("job-a", 42));
    expect(jobDedupeKey("job-a", 42)).toBe("job:job-a:conv:42");
  });

  it("never collides an approximate row with a precise one", () => {
    // Both describe conversation 42; one is measured, one is inferred. They must
    // be able to coexist without the report counting the reply twice.
    expect(attrDedupeKey(42, "july_promo")).not.toBe(jobDedupeKey("job-a", 42));
    expect(attrDedupeKey(42, "july_promo").startsWith("attr:")).toBe(true);
    expect(jobDedupeKey("job-a", 42).startsWith("job:")).toBe(true);
  });
});
