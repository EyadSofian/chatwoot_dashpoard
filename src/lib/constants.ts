/**
 * Shared constants mirrored from the Engosoft Chatwoot stack
 * (Chatwoot-Actions + chatwoot-campain-uploder). Attribute names MUST match
 * production exactly or campaign/department correlation silently breaks.
 */

export type Department = "sales" | "operations" | "complaints" | "unknown";

export const DEPARTMENTS: Department[] = ["sales", "operations", "complaints", "unknown"];

export const DEPARTMENT_LABELS_AR: Record<Department, string> = {
  sales: "المبيعات",
  operations: "العمليات",
  complaints: "الشكاوى",
  unknown: "غير محدد",
};

export const DEPARTMENT_LABELS_EN: Record<Department, string> = {
  sales: "Sales",
  operations: "Operations",
  complaints: "Complaints",
  unknown: "Unknown",
};

/** Conversation custom-attribute keys written by Chatwoot-Actions. */
export const DEPARTMENT_ATTRS = {
  department: "engosoft_department",
  routeState: "engosoft_department_route_state",
  teamId: "engosoft_department_team_id",
  promptNext: "engosoft_department_prompt_next",
  promptedAt: "engosoft_department_prompted_at",
  routedAt: "engosoft_department_routed_at",
  autoAssignedAgentId: "engosoft_department_auto_assigned_agent_id",
  manualAssignment: "engosoft_department_manual_assignment",
  botRelease: "engosoft_bot_release",
} as const;

/** Conversation custom-attribute keys written by the campaign uploader. */
export const CAMPAIGN_ATTRS = {
  label: "api_campaign_label",
  status: "api_campaign_status",
  createdAt: "api_campaign_created_at",
  markedAt: "api_campaign_marked_at",
  activeUntil: "api_campaign_active_until",
  lastError: "api_campaign_last_error",
  lastLabel: "last_api_campaign_label",
  lastTemplate: "last_api_template",
  replyAssignMode: "api_campaign_reply_assign_mode",
  replyTeamId: "api_campaign_reply_team_id",
  replyTeamName: "api_campaign_reply_team_name",
  replyInboxId: "api_campaign_reply_inbox_id",
  replyAssignmentKey: "api_campaign_reply_assignment_key",
  replyPending: "api_campaign_reply_pending",
  replyAssignedAt: "api_campaign_reply_assigned_at",
  replyAssigneeId: "api_campaign_reply_assignee_id",
  replyAssigneeName: "api_campaign_reply_assignee_name",
} as const;

/** Prefix of the per-send dedupe marker: `api_sent_<label>_<template>`. */
export const CAMPAIGN_SENT_PREFIX = "api_sent_";

export type CampaignSource = "sales" | "operations";

export const CAMPAIGN_SOURCE_LABELS_AR: Record<CampaignSource, string> = {
  sales: "كامبينات المبيعات",
  operations: "كامبينات العمليات",
};

/** Chatwoot message_type numeric enum. */
export const MESSAGE_TYPE = {
  incoming: 0,
  outgoing: 1,
  activity: 2,
  template: 3,
} as const;

export type ConversationStatus = "open" | "pending" | "resolved" | "snoozed";

export const CONVERSATION_STATUSES: ConversationStatus[] = ["open", "pending", "resolved", "snoozed"];

export const STATUS_LABELS_AR: Record<string, string> = {
  open: "مفتوحة",
  pending: "قيد الانتظار",
  resolved: "تم الحل",
  snoozed: "مؤجلة",
};

export type SlaState = "healthy" | "near_breach" | "breached";

export const SLA_LABELS_AR: Record<SlaState, string> = {
  healthy: "سليمة",
  near_breach: "قريبة من الخرق",
  breached: "تم خرقها",
};

/** Navigation model for the dashboard shell. */
export const NAV_ITEMS = [
  { href: "/", key: "overview", labelAr: "نظرة عامة", labelEn: "Overview", icon: "LayoutDashboard" },
  { href: "/agents", key: "agents", labelAr: "الموظفون", labelEn: "Agents", icon: "Users" },
  { href: "/teams", key: "teams", labelAr: "التيمات", labelEn: "Teams", icon: "UsersRound" },
  { href: "/departments", key: "departments", labelAr: "الأقسام", labelEn: "Departments", icon: "Building2" },
  { href: "/conversations", key: "conversations", labelAr: "المحادثات", labelEn: "Conversations", icon: "MessagesSquare" },
  { href: "/campaigns", key: "campaigns", labelAr: "الكامبينات", labelEn: "Campaigns", icon: "Megaphone" },
  { href: "/sla", key: "sla", labelAr: "SLA", labelEn: "SLA", icon: "Gauge" },
  { href: "/fahd-bot", key: "fahd", labelAr: "Fahd Bot", labelEn: "Fahd Bot", icon: "Bot" },
  { href: "/exports", key: "exports", labelAr: "التصدير", labelEn: "Exports", icon: "Download" },
  { href: "/settings", key: "settings", labelAr: "الإعدادات", labelEn: "Settings", icon: "Settings" },
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]["key"];

/**
 * Sidebar sections. Grouping keeps a ten-item menu scannable: you look for the
 * kind of question you have, not the page name you half-remember.
 */
export const NAV_GROUPS: { titleAr: string; keys: NavKey[] }[] = [
  { titleAr: "التحليلات", keys: ["overview", "agents", "teams", "departments", "conversations", "campaigns"] },
  { titleAr: "التشغيل", keys: ["sla", "fahd", "exports"] },
  { titleAr: "النظام", keys: ["settings"] },
];

export const SESSION_COOKIE = "engosoft_analytics_session";
