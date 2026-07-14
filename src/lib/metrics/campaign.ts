import { toDate } from "@/lib/time";
import { CAMPAIGN_ATTRS, CAMPAIGN_SENT_PREFIX } from "@/lib/constants";

export interface CampaignCorrelation {
  isCampaign: boolean;
  campaignLabel: string | null;
  campaignStatus: string | null;
  campaignTemplate: string | null;
  campaignCreatedAt: Date | null;
  campaignMarkedAt: Date | null;
  campaignActiveUntil: Date | null;
  /** The `api_sent_<label>_<template>` keys the uploader stamps per send. */
  sentMarkers: string[];
  reply: {
    mode: string | null;
    pending: boolean;
    teamId: string | null;
    teamName: string | null;
    inboxId: string | null;
    assignedAt: Date | null;
    assigneeId: number | null;
    assigneeName: string | null;
  };
}

function str(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

/**
 * Read the campaign markers the uploader writes onto a conversation's
 * custom_attributes. A conversation is a campaign if it carries an active
 * label, a last-campaign label, or any per-send `api_sent_*` marker.
 */
export function correlateCampaign(attrs: Record<string, unknown> | null | undefined): CampaignCorrelation {
  const a = attrs || {};
  const label = str(a[CAMPAIGN_ATTRS.label]) ?? str(a[CAMPAIGN_ATTRS.lastLabel]);
  const sentMarkers = Object.keys(a).filter((k) => k.startsWith(CAMPAIGN_SENT_PREFIX));
  const isCampaign = Boolean(label) || sentMarkers.length > 0;

  const replyAssigneeId = str(a[CAMPAIGN_ATTRS.replyAssigneeId]);
  const pendingRaw = a[CAMPAIGN_ATTRS.replyPending];
  const pending = pendingRaw === true || String(pendingRaw).toLowerCase() === "true";

  return {
    isCampaign,
    campaignLabel: label,
    campaignStatus: str(a[CAMPAIGN_ATTRS.status]),
    campaignTemplate: str(a[CAMPAIGN_ATTRS.lastTemplate]),
    campaignCreatedAt: toDate(a[CAMPAIGN_ATTRS.createdAt]),
    campaignMarkedAt: toDate(a[CAMPAIGN_ATTRS.markedAt]),
    campaignActiveUntil: toDate(a[CAMPAIGN_ATTRS.activeUntil]),
    sentMarkers,
    reply: {
      mode: str(a[CAMPAIGN_ATTRS.replyAssignMode]),
      pending,
      teamId: str(a[CAMPAIGN_ATTRS.replyTeamId]),
      teamName: str(a[CAMPAIGN_ATTRS.replyTeamName]),
      inboxId: str(a[CAMPAIGN_ATTRS.replyInboxId]),
      assignedAt: toDate(a[CAMPAIGN_ATTRS.replyAssignedAt]),
      assigneeId: replyAssigneeId ? Number(replyAssigneeId) : null,
      assigneeName: str(a[CAMPAIGN_ATTRS.replyAssigneeName]),
    },
  };
}
