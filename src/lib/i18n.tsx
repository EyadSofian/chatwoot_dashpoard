"use client";

import { createContext, useContext, useEffect } from "react";
import { setFormatLocale } from "@/lib/format";

/**
 * English-only presentation. Existing call sites keep `tr(ar, en)` so the
 * reporting code does not need a risky copy rewrite; this provider always
 * selects the English string and forces LTR even if an old browser preference
 * was stored by a previous bilingual release.
 */

export type Locale = "ar" | "en";

interface LocaleContextValue {
  locale: Locale;
  dir: "rtl" | "ltr";
  /** Pick the string for the active locale. */
  tr: (ar: string, en: string) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  dir: "ltr",
  tr: (_ar, en) => en,
});

function apply(locale: Locale) {
  // Numbers/dates/durations follow the locale too — set before paint so the
  // formatters read the right value on the re-render this triggers.
  setFormatLocale(locale);
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.lang = locale;
  el.dir = locale === "ar" ? "rtl" : "ltr";
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    apply("en");
  }, []);

  return (
    <LocaleContext.Provider value={{ locale: "en", dir: "ltr", tr: (_ar, en) => en }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

/* ── Locale-aware label maps ─────────────────────────────────────────────────
   Shared enums (status, department, SLA, campaign source) translated in one
   place so every screen agrees. Pass the active locale from a component.        */

export function statusLabel(status: string | null | undefined, locale: Locale): string {
  if (!status) return "—";
  const map: Record<string, [string, string]> = {
    open: ["مفتوحة", "Open"],
    pending: ["منتظرة", "Pending"],
    resolved: ["محلولة", "Resolved"],
    snoozed: ["مؤجلة", "Snoozed"],
  };
  const pair = map[status];
  return pair ? pair[locale === "ar" ? 0 : 1] : status;
}

export function departmentLabel(dep: string | null | undefined, locale: Locale): string {
  if (!dep) return "—";
  const map: Record<string, [string, string]> = {
    sales: ["المبيعات", "Sales"],
    operations: ["العمليات", "Operations"],
    complaints: ["الشكاوى", "Complaints"],
    unknown: ["غير محدد", "Unspecified"],
  };
  const pair = map[dep];
  return pair ? pair[locale === "ar" ? 0 : 1] : dep;
}

export function slaLabel(state: string | null | undefined, locale: Locale): string {
  if (!state) return "—";
  const map: Record<string, [string, string]> = {
    breached: ["خرق", "Breached"],
    near_breach: ["قريب من الخرق", "Near breach"],
    healthy: ["سليم", "Healthy"],
  };
  const pair = map[state];
  return pair ? pair[locale === "ar" ? 0 : 1] : state;
}

export function campaignSourceLabel(source: string | null | undefined, locale: Locale): string {
  if (!source) return "—";
  if (source === "sales") return locale === "ar" ? "مبيعات" : "Sales";
  if (source === "operations") return locale === "ar" ? "عمليات" : "Operations";
  return source;
}
