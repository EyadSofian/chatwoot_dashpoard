/** Presentation helpers shared by server responses and client components. */

/**
 * Display locale, set once by the LocaleProvider. A module-level value rather
 * than a parameter so the hundreds of `formatNumber(x)` call sites stay
 * untouched: toggling the locale re-renders the tree, and each formatter reads
 * the current value at render time. Server code never calls setFormatLocale, so
 * it keeps the Arabic default.
 */
let displayLocale: "ar" | "en" = "ar";
export function setFormatLocale(locale: "ar" | "en") {
  displayLocale = locale;
}

/** Arabic keeps Arabic-Indic digits (٥٨); English uses Latin (58). */
const numberLocale = () => (displayLocale === "ar" ? "ar-EG" : "en-US");
const dateLocale = () => (displayLocale === "ar" ? "ar-EG" : "en-GB");

export function formatDurationShort(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—";
  const ar = displayLocale === "ar";
  const u = ar ? { s: "ث", m: "د", h: "س", d: "ي" } : { s: "s", m: "m", h: "h", d: "d" };
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}${u.s}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}${u.m}`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return remM ? `${h}${u.h} ${remM}${u.m}` : `${h}${u.h}`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH ? `${d}${u.d} ${remH}${u.h}` : `${d}${u.d}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "0";
  return new Intl.NumberFormat(numberLocale()).format(value);
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "0%";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDateTime(value: string | Date | null | undefined, timezone = "Africa/Cairo"): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(dateLocale(), {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(value: string | Date | null | undefined, timezone = "Africa/Cairo"): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(dateLocale(), {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function median(values: number[]): number | null {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid]! : (nums[mid - 1]! + nums[mid]!) / 2;
}

export function average(values: number[]): number | null {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Nearest-rank percentile. p90 is the number that matters for response time:
 * an average hides the tail, and the tail is what a customer actually feels.
 */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1]!;
}
