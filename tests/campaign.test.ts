import { describe, it, expect } from "vitest";
import { correlateCampaign } from "@/lib/metrics/campaign";

/**
 * The exact custom_attributes the campaign uploader (chatwoot-campain-uploder)
 * stamps on a conversation. Names must match production byte for byte — if one
 * drifts, campaign reporting silently reports zero.
 */
const FULL_ATTRS: Record<string, unknown> = {
  api_campaign_label: "july_promo",
  api_campaign_status: "sent",
  api_campaign_created_at: "2026-07-01T09:00:00Z",
  api_campaign_marked_at: "2026-07-01T09:00:05Z",
  api_campaign_active_until: "2026-07-08T09:00:00Z",
  last_api_campaign_label: "june_promo",
  last_api_template: "promo_template_v2",
  api_sent_july_promo_promo_template_v2: "2026-07-01T09:00:00Z",
  api_campaign_reply_assign_mode: "round_robin",
  api_campaign_reply_team_id: "4",
  api_campaign_reply_team_name: "Sales",
  api_campaign_reply_inbox_id: "27",
  api_campaign_reply_pending: "false",
  api_campaign_reply_assigned_at: "2026-07-01T09:30:00Z",
  api_campaign_reply_assignee_id: "10",
  api_campaign_reply_assignee_name: "Mona",
};

describe("campaign reply correlation", () => {
  it("reads every campaign attribute the uploader writes", () => {
    const c = correlateCampaign(FULL_ATTRS);

    expect(c.isCampaign).toBe(true);
    expect(c.campaignLabel).toBe("july_promo");
    expect(c.campaignStatus).toBe("sent");
    expect(c.campaignTemplate).toBe("promo_template_v2");
    expect(c.campaignCreatedAt).toEqual(new Date("2026-07-01T09:00:00Z"));
    expect(c.campaignMarkedAt).toEqual(new Date("2026-07-01T09:00:05Z"));
    expect(c.campaignActiveUntil).toEqual(new Date("2026-07-08T09:00:00Z"));
    expect(c.sentMarkers).toEqual(["api_sent_july_promo_promo_template_v2"]);

    expect(c.reply.mode).toBe("round_robin");
    expect(c.reply.pending).toBe(false);
    expect(c.reply.teamId).toBe("4");
    expect(c.reply.teamName).toBe("Sales");
    expect(c.reply.inboxId).toBe("27");
    expect(c.reply.assignedAt).toEqual(new Date("2026-07-01T09:30:00Z"));
    expect(c.reply.assigneeId).toBe(10);
    expect(c.reply.assigneeName).toBe("Mona");
  });

  it("is not a campaign when no campaign attribute is present", () => {
    const c = correlateCampaign({ engosoft_department: "sales", some_other_attr: "x" });
    expect(c.isCampaign).toBe(false);
    expect(c.campaignLabel).toBeNull();
    expect(c.sentMarkers).toEqual([]);
    expect(c.reply.assigneeId).toBeNull();
  });

  it("detects a campaign from an api_sent_* marker alone", () => {
    const c = correlateCampaign({ api_sent_ramadan_offer_tpl1: "2026-03-01T08:00:00Z" });
    expect(c.isCampaign).toBe(true);
    expect(c.sentMarkers).toEqual(["api_sent_ramadan_offer_tpl1"]);
  });

  it("falls back to last_api_campaign_label when the active label is gone", () => {
    const c = correlateCampaign({
      last_api_campaign_label: "june_promo",
      last_api_template: "promo_template_v1",
    });
    expect(c.isCampaign).toBe(true);
    expect(c.campaignLabel).toBe("june_promo");
    expect(c.campaignTemplate).toBe("promo_template_v1");
  });

  it("prefers the active label over the last label", () => {
    const c = correlateCampaign({
      api_campaign_label: "july_promo",
      last_api_campaign_label: "june_promo",
    });
    expect(c.campaignLabel).toBe("july_promo");
  });

  it("collects every api_sent_* marker when a contact received several sends", () => {
    const c = correlateCampaign({
      api_campaign_label: "july_promo",
      api_sent_june_promo_tpl1: "2026-06-01T08:00:00Z",
      api_sent_july_promo_tpl2: "2026-07-01T08:00:00Z",
    });
    expect([...c.sentMarkers].sort()).toEqual(["api_sent_july_promo_tpl2", "api_sent_june_promo_tpl1"]);
  });

  it("treats a pending reply flag as true whether it is a boolean or a string", () => {
    expect(correlateCampaign({ api_campaign_label: "x", api_campaign_reply_pending: true }).reply.pending).toBe(true);
    expect(correlateCampaign({ api_campaign_label: "x", api_campaign_reply_pending: "true" }).reply.pending).toBe(true);
    expect(correlateCampaign({ api_campaign_label: "x", api_campaign_reply_pending: "TRUE" }).reply.pending).toBe(true);
    expect(correlateCampaign({ api_campaign_label: "x", api_campaign_reply_pending: false }).reply.pending).toBe(false);
    expect(correlateCampaign({ api_campaign_label: "x" }).reply.pending).toBe(false);
  });

  it("coerces a numeric assignee id written as a string", () => {
    const c = correlateCampaign({ api_campaign_label: "x", api_campaign_reply_assignee_id: "10" });
    expect(c.reply.assigneeId).toBe(10);
  });

  it("tolerates null, undefined and empty attribute bags", () => {
    for (const attrs of [null, undefined, {}]) {
      const c = correlateCampaign(attrs);
      expect(c.isCampaign).toBe(false);
      expect(c.campaignLabel).toBeNull();
      expect(c.campaignCreatedAt).toBeNull();
    }
  });

  it("accepts unix-second timestamps as well as ISO strings", () => {
    const c = correlateCampaign({
      api_campaign_label: "x",
      api_campaign_created_at: 1782900000, // seconds
    });
    expect(c.campaignCreatedAt).toEqual(new Date(1782900000 * 1000));
  });
});
