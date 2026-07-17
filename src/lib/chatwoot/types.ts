/** Loose structural types for the Chatwoot payloads we consume. */

export interface CwConnection {
  baseUrl: string;
  accountId: string;
  apiToken: string;
}

export interface CwAgent {
  id: number;
  name?: string;
  email?: string;
  role?: string;
  availability_status?: string;
  thumbnail?: string;
  confirmed?: boolean;
  available_name?: string;
}

export interface CwTeam {
  id: number;
  name?: string;
}

export interface CwLabel {
  id: number;
  title?: string;
  description?: string;
  color?: string;
  show_on_sidebar?: boolean;
}

export interface CwInbox {
  id: number;
  name?: string;
  channel_type?: string;
}

export interface CwContact {
  id: number;
  name?: string;
  phone_number?: string;
  email?: string;
  identifier?: string;
  custom_attributes?: Record<string, unknown>;
}

export interface CwMessage {
  id: number;
  content?: string | null;
  message_type?: number; // 0 in, 1 out, 2 activity, 3 template
  content_type?: string;
  private?: boolean;
  created_at?: number | string;
  sender?: { id?: number; name?: string; type?: string; available_name?: string } | null;
  sender_type?: string;
  content_attributes?: Record<string, unknown> & { template_params?: unknown };
  status?: string;
}

export interface CwConversationMeta {
  sender?: CwContact;
  assignee?: CwAgent | null;
  team?: CwTeam | null;
}

export interface CwConversation {
  id: number;
  display_id?: number;
  account_id?: number;
  inbox_id?: number;
  status?: string;
  unread_count?: number;
  labels?: string[];
  created_at?: number | string;
  updated_at?: number | string;
  last_activity_at?: number | string;
  /** Epoch seconds since the customer has been waiting for a reply; 0/absent = not waiting. */
  waiting_since?: number | string | null;
  snoozed_until?: number | string | null;
  custom_attributes?: Record<string, unknown>;
  additional_attributes?: Record<string, unknown>;
  meta?: CwConversationMeta;
  messages?: CwMessage[];
  team_id?: number | null;
  contact?: CwContact;
}

export interface CwReportingEvent {
  id?: number;
  name?: string; // first_response | conversation_resolved | reply_time | ...
  value?: number;
  value_in_business_hours?: number;
  conversation_id?: number;
  user_id?: number;
  inbox_id?: number;
  created_at?: number | string;
  event_start_time?: number | string;
  event_end_time?: number | string;
}

export interface CwPaginated<T> {
  payload?: T[];
  data?: { payload?: T[]; meta?: Record<string, unknown> };
  meta?: Record<string, unknown>;
}
