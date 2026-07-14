import { describe, it, expect } from "vitest";
import { classifyMessage, normalizeMessages } from "@/lib/metrics/humanReply";
import type { CwMessage } from "@/lib/chatwoot/types";

const BOT_IDS = new Set<number>([77]); // a Fahd/Botpress user id from BOT_AGENT_IDS

const at = "2026-07-01T10:00:00Z";

function msg(over: Partial<CwMessage>): CwMessage {
  return { id: 1, created_at: at, ...over };
}

/** A public outgoing message from a real agent — the only thing that counts. */
const humanReply = msg({
  id: 100,
  message_type: 1,
  private: false,
  content: "أهلاً بك، تحت أمرك",
  sender: { id: 10, name: "Mona", type: "user" },
});

describe("message classifier", () => {
  it("counts a public outgoing message from a human agent", () => {
    const m = classifyMessage(humanReply, BOT_IDS);
    expect(m.isHumanReply).toBe(true);
    expect(m.isBot).toBe(false);
    expect(m.isTemplate).toBe(false);
    expect(m.isAutomation).toBe(false);
    expect(m.isCustomerIncoming).toBe(false);
    expect(m.senderId).toBe(10);
  });

  it("counts an incoming message from the customer", () => {
    const m = classifyMessage(
      msg({ id: 101, message_type: 0, private: false, sender: { id: 5, name: "عميل", type: "contact" } }),
      BOT_IDS,
    );
    expect(m.isCustomerIncoming).toBe(true);
    expect(m.isHumanReply).toBe(false);
    expect(m.isBot).toBe(false);
  });

  it("ignores a private note, even from a human agent", () => {
    const m = classifyMessage({ ...humanReply, id: 102, private: true }, BOT_IDS);
    expect(m.private).toBe(true);
    expect(m.isHumanReply).toBe(false);
    expect(m.isCustomerIncoming).toBe(false);
  });

  it("ignores a Fahd/Botpress message sent as an agent_bot", () => {
    const m = classifyMessage(
      msg({ id: 103, message_type: 1, private: false, sender: { id: 900, name: "Fahd", type: "agent_bot" } }),
      BOT_IDS,
    );
    expect(m.isBot).toBe(true);
    expect(m.isHumanReply).toBe(false);
  });

  it("ignores a bot message identified only by its configured sender id", () => {
    const m = classifyMessage(
      msg({ id: 104, message_type: 1, private: false, sender: { id: 77, name: "Fahd", type: "user" } }),
      BOT_IDS,
    );
    expect(m.isBot).toBe(true);
    expect(m.isHumanReply).toBe(false);
  });

  it("ignores an automation-rule message (outgoing, public, no sender)", () => {
    const m = classifyMessage(
      msg({
        id: 105,
        message_type: 1,
        private: false,
        content: "شكراً لتواصلك، سيتم الرد قريباً",
        sender: null,
        content_attributes: { automation_rule_id: 12 },
      }),
      BOT_IDS,
    );
    expect(m.isAutomation).toBe(true);
    expect(m.isHumanReply).toBe(false);
  });

  it("ignores a WhatsApp campaign template send (template_params)", () => {
    const m = classifyMessage(
      msg({
        id: 106,
        message_type: 1,
        private: false,
        sender: { id: 10, name: "Mona", type: "user" },
        content_attributes: { template_params: { name: "promo_july", category: "MARKETING" } },
      }),
      BOT_IDS,
    );
    expect(m.isTemplate).toBe(true);
    expect(m.isHumanReply).toBe(false);
  });

  it("ignores a template-typed message (message_type 3)", () => {
    const m = classifyMessage(msg({ id: 107, message_type: 3, private: false }), BOT_IDS);
    expect(m.isTemplate).toBe(true);
    expect(m.isHumanReply).toBe(false);
  });

  it("ignores a native Chatwoot campaign send (campaign_id)", () => {
    const m = classifyMessage(
      msg({
        id: 108,
        message_type: 1,
        private: false,
        sender: { id: 10, type: "user" },
        content_attributes: { campaign_id: 4 },
      }),
      BOT_IDS,
    );
    expect(m.isTemplate).toBe(true);
    expect(m.isHumanReply).toBe(false);
  });

  it("ignores an outgoing message with no sender at all (system)", () => {
    const m = classifyMessage(msg({ id: 109, message_type: 1, private: false, content: "..." }), BOT_IDS);
    expect(m.isHumanReply).toBe(false);
  });

  it("ignores activity messages", () => {
    const m = classifyMessage(msg({ id: 110, message_type: 2, content: "Conversation was resolved" }), BOT_IDS);
    expect(m.isHumanReply).toBe(false);
    expect(m.isCustomerIncoming).toBe(false);
  });

  it("does not mistake a contact whose id collides with a bot id for a bot", () => {
    const m = classifyMessage(
      msg({ id: 111, message_type: 0, private: false, sender: { id: 77, name: "عميل", type: "contact" } }),
      BOT_IDS,
    );
    expect(m.isBot).toBe(false);
    expect(m.isCustomerIncoming).toBe(true);
  });

  it("normalizes a full thread in chronological order and keeps only real replies", () => {
    const thread = normalizeMessages(
      [
        msg({ id: 3, message_type: 1, created_at: "2026-07-01T10:20:00Z", sender: { id: 10, type: "user" } }),
        msg({ id: 1, message_type: 0, created_at: "2026-07-01T10:00:00Z", sender: { id: 5, type: "contact" } }),
        msg({
          id: 2,
          message_type: 1,
          created_at: "2026-07-01T10:10:00Z",
          sender: null,
          content_attributes: { automation_rule_id: 1 },
        }),
      ],
      BOT_IDS,
    );

    expect(thread.map((m) => m.chatwootId)).toEqual([1, 2, 3]);
    expect(thread.filter((m) => m.isHumanReply).map((m) => m.chatwootId)).toEqual([3]);
    expect(thread.filter((m) => m.isCustomerIncoming).map((m) => m.chatwootId)).toEqual([1]);
  });
});
