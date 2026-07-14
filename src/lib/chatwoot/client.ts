import { env } from "@/env";
import type {
  CwAgent,
  CwConnection,
  CwConversation,
  CwInbox,
  CwMessage,
  CwReportingEvent,
  CwTeam,
} from "./types";

export class ChatwootError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ChatwootError";
    this.status = status;
    this.body = body;
  }
}

export function connectionFromEnv(): CwConnection {
  return {
    baseUrl: env.chatwootBaseUrl(),
    accountId: env.chatwootAccountId(),
    apiToken: env.chatwootApiToken(),
  };
}

/** Unwrap Chatwoot's `{ payload: [...] }` (or bare array) into a list. */
export function getPayload<T = unknown>(response: unknown): T[] {
  if (!response) return [];
  if (Array.isArray(response)) return response as T[];
  const r = response as { payload?: unknown; data?: { payload?: unknown } };
  if (Array.isArray(r.payload)) return r.payload as T[];
  if (r.data && Array.isArray(r.data.payload)) return r.data.payload as T[];
  return [];
}

export function getMeta(response: unknown): Record<string, unknown> {
  if (!response) return {};
  const r = response as { meta?: Record<string, unknown>; data?: { meta?: Record<string, unknown> } };
  return r.meta ?? r.data?.meta ?? {};
}

export class ChatwootClient {
  private baseUrl: string;
  private accountId: string;
  private apiToken: string;

  constructor(conn?: Partial<CwConnection>) {
    const base = conn ?? connectionFromEnv();
    this.baseUrl = (base.baseUrl || "").replace(/\/+$/, "");
    this.accountId = base.accountId || "";
    this.apiToken = base.apiToken || "";
    if (!this.baseUrl || !this.accountId || !this.apiToken) {
      throw new ChatwootError(
        "Missing Chatwoot connection (baseUrl, accountId, apiToken).",
        500,
        null,
      );
    }
  }

  private buildUrl(path: string, query: Record<string, unknown> = {}): string {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(`${key}[]`, String(v));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async request<T = unknown>(
    path: string,
    opts: { method?: string; query?: Record<string, unknown>; body?: unknown; version?: "v1" | "v2" } = {},
  ): Promise<T> {
    const { method = "GET", query, body } = opts;
    const headers: Record<string, string> = { api_access_token: this.apiToken };
    const init: RequestInit = { method, headers, cache: "no-store" };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    init.signal = controller.signal;
    try {
      const res = await fetch(this.buildUrl(path, query), init);
      const text = await res.text();
      const parsed = text ? safeJson(text) : null;
      if (!res.ok) {
        const message =
          (parsed as { error?: string; message?: string })?.error ||
          (parsed as { message?: string })?.message ||
          `Chatwoot API ${res.status}`;
        throw new ChatwootError(message, res.status, parsed ?? text);
      }
      return parsed as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private acc(path: string): string {
    return `/api/v1/accounts/${this.accountId}${path}`;
  }
  private rep(path: string): string {
    return `/api/v2/accounts/${this.accountId}${path}`;
  }

  // Entities
  listAgents() {
    return this.request<CwAgent[]>(this.acc("/agents"));
  }
  listTeams() {
    return this.request<CwTeam[]>(this.acc("/teams"));
  }
  listInboxes() {
    return this.request<{ payload: CwInbox[] }>(this.acc("/inboxes"));
  }
  listLabels() {
    return this.request<{ payload: unknown[] }>(this.acc("/labels"));
  }
  teamMembers(teamId: number | string) {
    return this.request<CwAgent[]>(this.acc(`/teams/${teamId}/team_members`));
  }

  // Conversations
  listConversations(query: Record<string, unknown> = {}) {
    return this.request<{ data?: { payload?: CwConversation[]; meta?: Record<string, unknown> } }>(
      this.acc("/conversations"),
      { query },
    );
  }
  filterConversations(payload: unknown[], page = 1) {
    return this.request<{ payload?: CwConversation[]; meta?: Record<string, unknown> }>(
      this.acc("/conversations/filter"),
      { method: "POST", query: { page }, body: { payload } },
    );
  }
  conversationDetails(id: number | string) {
    return this.request<CwConversation>(this.acc(`/conversations/${id}`));
  }
  conversationMessages(id: number | string, query: Record<string, unknown> = {}) {
    return this.request<{ payload?: CwMessage[]; meta?: Record<string, unknown> }>(
      this.acc(`/conversations/${id}/messages`),
      { query },
    );
  }

  // Reporting
  reportingEvents(query: Record<string, unknown> = {}) {
    return this.request<CwReportingEvent[] | { payload?: CwReportingEvent[] }>(
      this.acc("/reporting_events"),
      { query },
    );
  }
  reportsSummary(query: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown>>(this.rep("/reports/summary"), { query });
  }
  accountReport(query: Record<string, unknown> = {}) {
    return this.request<unknown>(this.rep("/reports"), { query });
  }

  /** Lightweight connectivity probe used by the Settings screen. */
  async probe(): Promise<{ ok: boolean; agents: number; inboxes: number; teams: number }> {
    const [agents, inboxesRes, teams] = await Promise.all([
      this.listAgents().catch(() => [] as CwAgent[]),
      this.listInboxes().catch(() => ({ payload: [] as CwInbox[] })),
      this.listTeams().catch(() => [] as CwTeam[]),
    ]);
    const inboxes = getPayload<CwInbox>(inboxesRes);
    return {
      ok: true,
      agents: Array.isArray(agents) ? agents.length : getPayload(agents).length,
      inboxes: inboxes.length,
      teams: Array.isArray(teams) ? teams.length : getPayload(teams).length,
    };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
