"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { setFormatLocale } from "@/lib/format";

/**
 * Bilingual UI — Arabic (RTL, default) and English (LTR).
 *
 * Strings are translated inline with `tr(ar, en)` rather than through a central
 * key dictionary. For a two-language app that keeps each translation beside the
 * markup it belongs to, so nothing drifts out of sync and there are no orphaned
 * keys. `dir` and `lang` flip on <html> automatically — every layout already
 * uses logical properties (start/end, ps/pe), so the mirror is free.
 */

export type Locale = "ar" | "en";

interface LocaleContextValue {
  locale: Locale;
  dir: "rtl" | "ltr";
  setLocale: (l: Locale) => void;
  toggle: () => void;
  /** Pick the string for the active locale. */
  tr: (ar: string, en: string) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "ar",
  dir: "rtl",
  setLocale: () => {},
  toggle: () => {},
  tr: (ar) => ar,
});

const STORAGE_KEY = "engosoft-analytics-locale";

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
  const [locale, setLocaleState] = useState<Locale>("ar");

  useEffect(() => {
    let initial: Locale = "ar";
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (stored === "ar" || stored === "en") initial = stored;
    } catch {
      /* private mode */
    }
    setLocaleState(initial);
    apply(initial);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    apply(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => setLocale(locale === "ar" ? "en" : "ar"), [locale, setLocale]);

  const tr = useCallback((ar: string, en: string) => (locale === "ar" ? ar : en), [locale]);

  return (
    <LocaleContext.Provider value={{ locale, dir: locale === "ar" ? "rtl" : "ltr", setLocale, toggle, tr }}>
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
