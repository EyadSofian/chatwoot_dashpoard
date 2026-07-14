/**
 * Central environment access. Reads process.env lazily so the app can build
 * without every secret present; server-only routes call `assertServerEnv()`
 * (or the specific getters) at request time and fail loudly when misconfigured.
 */

function raw(key: string): string | undefined {
  const value = process.env[key];
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed === "" ? undefined : trimmed;
}

function required(key: string): string {
  const value = raw(key);
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function bool(key: string, fallback = false): boolean {
  const value = raw(key);
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on", "enabled"].includes(value.toLowerCase());
}

function num(key: string, fallback: number): number {
  const value = Number(raw(key));
  return Number.isFinite(value) ? value : fallback;
}

function list(key: string): string[] {
  const value = raw(key);
  if (!value) return [];
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export const env = {
  // Chatwoot
  chatwootBaseUrl: () => (raw("CHATWOOT_BASE_URL") || "").replace(/\/+$/, ""),
  chatwootAccountId: () => raw("CHATWOOT_ACCOUNT_ID") || "",
  chatwootApiToken: () => raw("CHATWOOT_API_TOKEN") || "",

  // Webhook
  webhookSecret: () => raw("WEBHOOK_SECRET") || "",
  webhookMaxAgeSeconds: () => num("WEBHOOK_MAX_AGE_SECONDS", 0),

  // Database
  databaseUrl: () => raw("DATABASE_URL") || "",

  // Campaign apps
  campaignSalesUrl: () => (raw("CAMPAIGN_SALES_APP_URL") || "").replace(/\/+$/, ""),
  campaignOperationsUrl: () => (raw("CAMPAIGN_OPERATIONS_APP_URL") || "").replace(/\/+$/, ""),
  campaignAppsApiSecret: () => raw("CAMPAIGN_APPS_API_SECRET") || "",

  // Auth — OFF by default (no login screen). Set AUTH_ENABLED=true to require it.
  authEnabled: () => raw("AUTH_ENABLED") === "true",
  appUsername: () => raw("APP_USERNAME") || "admin",
  appPassword: () => raw("APP_PASSWORD") || "",
  sessionSecret: () =>
    raw("SESSION_SECRET") ||
    `${raw("APP_PASSWORD") || "engosoft"}::${raw("WEBHOOK_SECRET") || "analytics"}`,
  cronSecret: () => raw("CRON_SECRET") || "",

  // Locale / SLA
  timezone: () => raw("TIMEZONE") || "Africa/Cairo",
  slaFirstResponseMinutes: () => num("SLA_FIRST_RESPONSE_MINUTES", 30),
  slaResolutionHours: () => num("SLA_RESOLUTION_HOURS", 24),
  businessStart: () => raw("BUSINESS_START") || "09:00",
  businessEnd: () => raw("BUSINESS_END") || "22:00",
  businessDays: () => {
    const days = list("BUSINESS_DAYS").map(Number).filter((n) => n >= 0 && n <= 6);
    return days.length ? days : [0, 1, 2, 3, 4, 5, 6];
  },

  // Bot / departments
  botLabel: () => raw("BOT_LABEL") || "needs-bot",
  botInboxIds: () => list("BOT_INBOX_IDS"),
  botAgentIds: () => list("BOT_AGENT_IDS"),
  salesTeamId: () => raw("DEPARTMENT_SALES_TEAM_ID") || "",
  operationsTeamId: () => raw("DEPARTMENT_OPERATIONS_TEAM_ID") || "",
  complaintsTeamId: () => raw("DEPARTMENT_COMPLAINTS_TEAM_ID") || "",

  required,
  bool,
};

/** Throws if the minimum server config for talking to Chatwoot is missing. */
export function assertChatwootEnv(): void {
  required("CHATWOOT_BASE_URL");
  required("CHATWOOT_ACCOUNT_ID");
  required("CHATWOOT_API_TOKEN");
}

export function assertDatabaseEnv(): void {
  required("DATABASE_URL");
}
