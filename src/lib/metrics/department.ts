import type { Department } from "@/lib/constants";
import { DEPARTMENT_ATTRS } from "@/lib/constants";

/** Canonicalize free-text department (Arabic or English) to our four buckets. */
export function normalizeDepartmentText(value: string): Department | null {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return null;
  if (["sales", "مبيعات", "ريسيل", "resale"].some((k) => v.includes(k))) return "sales";
  if (["operations", "operation", "عمليات", "تشغيل", "support", "دعم"].some((k) => v.includes(k)))
    return "operations";
  if (["complaint", "complaints", "شكاوى", "شكوى", "شكاوي"].some((k) => v.includes(k))) return "complaints";
  return null;
}

export interface DepartmentInferenceInput {
  customAttributes?: Record<string, unknown> | null;
  teamId?: number | null;
  teamName?: string | null;
  inboxName?: string | null;
  salesTeamId?: string;
  operationsTeamId?: string;
  complaintsTeamId?: string;
}

/**
 * Resolve a conversation's department. Priority:
 *   1. engosoft_department custom attribute (set by Chatwoot-Actions)
 *   2. assigned team id → configured Sales/Operations/Complaints team
 *   3. team name / inbox name keywords
 *   4. "unknown"
 */
export function inferDepartment(input: DepartmentInferenceInput): Department {
  const attrs = input.customAttributes || {};
  const attrValue = attrs[DEPARTMENT_ATTRS.department];
  const fromAttr = typeof attrValue === "string" ? normalizeDepartmentText(attrValue) : null;
  if (fromAttr) return fromAttr;

  const teamIdStr = input.teamId != null ? String(input.teamId) : "";
  if (teamIdStr) {
    if (input.salesTeamId && teamIdStr === input.salesTeamId) return "sales";
    if (input.operationsTeamId && teamIdStr === input.operationsTeamId) return "operations";
    if (input.complaintsTeamId && teamIdStr === input.complaintsTeamId) return "complaints";
  }

  const fromTeamName = input.teamName ? normalizeDepartmentText(input.teamName) : null;
  if (fromTeamName) return fromTeamName;

  const fromInbox = input.inboxName ? normalizeDepartmentText(input.inboxName) : null;
  if (fromInbox) return fromInbox;

  return "unknown";
}
