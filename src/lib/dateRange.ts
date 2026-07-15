import { fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Date-range presets, anchored to Africa/Cairo — never to the browser's clock.
 *
 * A manager in Cairo asking for "today" means the Cairo day. If the boundary is
 * computed from the viewer's local timezone, the same report gives different
 * numbers depending on where it is opened, and a conversation at 00:30 Cairo can
 * fall into yesterday. Server and client both resolve boundaries through here,
 * so a range means one thing everywhere: presets, custom dates, CSV export, daily
 * grouping and SLA all agree.
 *
 * The URL carries the preset key and the resolved from/to:
 *   ?range=this_month&from=<iso>&to=<iso>
 */

export const REPORT_TIMEZONE = "Africa/Cairo";

export const RANGE_PRESETS = [
  { key: "today", labelAr: "اليوم", labelEn: "Today" },
  { key: "7d", labelAr: "٧ أيام", labelEn: "7 days" },
  { key: "30d", labelAr: "٣٠ يوم", labelEn: "30 days" },
  { key: "60d", labelAr: "٦٠ يوم", labelEn: "60 days" },
  { key: "90d", labelAr: "٩٠ يوم", labelEn: "90 days" },
  { key: "this_month", labelAr: "الشهر الحالي", labelEn: "This month" },
  { key: "last_month", labelAr: "الشهر الماضي", labelEn: "Last month" },
] as const;

export type RangeKey = (typeof RANGE_PRESETS)[number]["key"];
export type RangeSelection = RangeKey | "custom";

export const DEFAULT_RANGE: RangeKey = "30d";

/** The instant → its wall-clock parts in Cairo (as a Date whose getters read Cairo). */
const inCairo = (d: Date): Date => toZonedTime(d, REPORT_TIMEZONE);
/** Cairo wall-clock parts → the real UTC instant. */
const fromCairo = (wall: Date): Date => fromZonedTime(wall, REPORT_TIMEZONE);

/** 00:00:00.000 Cairo on the day containing `d`, as a UTC instant. */
export function cairoStartOfDay(d: Date): Date {
  const wall = inCairo(d);
  wall.setHours(0, 0, 0, 0);
  return fromCairo(wall);
}

/** 23:59:59.999 Cairo on the day containing `d`, as a UTC instant. */
export function cairoEndOfDay(d: Date): Date {
  const wall = inCairo(d);
  wall.setHours(23, 59, 59, 999);
  return fromCairo(wall);
}

/** 00:00 Cairo on the 1st of the month containing `d`. */
export function cairoStartOfMonth(d: Date): Date {
  const wall = inCairo(d);
  wall.setDate(1);
  wall.setHours(0, 0, 0, 0);
  return fromCairo(wall);
}

/** Resolve a preset to a concrete [from, to] using Cairo boundaries. */
export function resolveRange(key: RangeKey, now: Date = new Date()): { from: Date; to: Date } {
  switch (key) {
    case "today":
      return { from: cairoStartOfDay(now), to: new Date(now) };

    case "this_month":
      return { from: cairoStartOfMonth(now), to: new Date(now) };

    case "last_month": {
      const wall = inCairo(now);
      // First of the previous month, in Cairo wall-clock.
      const firstOfPrev = new Date(wall.getFullYear(), wall.getMonth() - 1, 1, 0, 0, 0, 0);
      // Day 0 of this month = the last day of the previous one.
      const lastOfPrev = new Date(wall.getFullYear(), wall.getMonth(), 0, 23, 59, 59, 999);
      return { from: fromCairo(firstOfPrev), to: fromCairo(lastOfPrev) };
    }

    default: {
      // Rolling windows start at the Cairo start-of-day N days back, so "7 days"
      // is seven whole days rather than a ragged 7×24h from the current minute.
      const days = Number(key.replace("d", ""));
      const wall = inCairo(now);
      const start = new Date(wall.getFullYear(), wall.getMonth(), wall.getDate() - (days - 1), 0, 0, 0, 0);
      return { from: fromCairo(start), to: new Date(now) };
    }
  }
}

/** `2026-07-14` (a Cairo calendar day) → the UTC instant at its start or end. */
export function parseDateInput(value: string, opts: { endOfDay?: boolean } = {}): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const wall = opts.endOfDay ? new Date(y, mo, d, 23, 59, 59, 999) : new Date(y, mo, d, 0, 0, 0, 0);
  if (Number.isNaN(wall.getTime())) return null;
  return fromCairo(wall);
}

/** UTC instant → the Cairo calendar day it falls on, as `2026-07-14`. */
export function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const wall = inCairo(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${wall.getFullYear()}-${pad(wall.getMonth() + 1)}-${pad(wall.getDate())}`;
}

/** `2026-07-14` in Cairo — the key daily trends group on. */
export function cairoDayKey(value: Date): string {
  return toDateInput(value);
}
