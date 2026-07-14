import { fromZonedTime, toZonedTime } from "date-fns-tz";

export interface BusinessHoursConfig {
  timezone: string;
  startMinutes: number; // minutes from local midnight
  endMinutes: number;
  days: number[]; // 0=Sunday .. 6=Saturday
}

/** "09:00" | "9:30" → minutes from midnight (fallback on parse failure). */
export function parseClockMinutes(value: string | undefined, fallback: number): number {
  const m = String(value ?? "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return fallback;
  return h * 60 + min;
}

/** Chatwoot timestamps arrive as unix-seconds (number) or ISO strings. */
export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    // seconds vs milliseconds heuristic
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function secondsBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
}

/**
 * Seconds of [start, end] that fall inside business hours, day by day, in the
 * configured timezone. Handles multi-day spans and non-working days.
 */
export function businessSecondsBetween(start: Date, end: Date, cfg: BusinessHoursConfig): number {
  if (end.getTime() <= start.getTime()) return 0;
  const days = cfg.days.length ? cfg.days : [0, 1, 2, 3, 4, 5, 6];
  let total = 0;

  // Walk each local calendar day from start to end (cap to avoid runaway loops).
  const zonedStart = toZonedTime(start, cfg.timezone);
  const cursor = new Date(zonedStart);
  cursor.setHours(0, 0, 0, 0);
  let guard = 0;
  while (guard++ < 800) {
    // Local wall-clock day boundaries → instants.
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const d = cursor.getDate();
    const weekday = new Date(y, m, d).getDay();

    if (days.includes(weekday)) {
      const winStartLocal = new Date(y, m, d, 0, 0, 0, 0);
      winStartLocal.setMinutes(cfg.startMinutes);
      const winEndLocal = new Date(y, m, d, 0, 0, 0, 0);
      winEndLocal.setMinutes(cfg.endMinutes);

      const winStart = fromZonedTime(winStartLocal, cfg.timezone);
      const winEnd = fromZonedTime(winEndLocal, cfg.timezone);

      const overlapStart = Math.max(start.getTime(), winStart.getTime());
      const overlapEnd = Math.min(end.getTime(), winEnd.getTime());
      if (overlapEnd > overlapStart) total += Math.round((overlapEnd - overlapStart) / 1000);
    }

    // Advance one local day.
    cursor.setDate(cursor.getDate() + 1);
    const cursorInstant = fromZonedTime(
      new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 0, 0, 0, 0),
      cfg.timezone,
    );
    if (cursorInstant.getTime() > end.getTime()) break;
  }
  return total;
}

export type SlaState = "healthy" | "near_breach" | "breached";

export function slaState(actualSeconds: number | null | undefined, targetSeconds: number, nearRatio = 0.8): SlaState {
  if (actualSeconds === null || actualSeconds === undefined) return "healthy";
  if (actualSeconds > targetSeconds) return "breached";
  if (actualSeconds >= targetSeconds * nearRatio) return "near_breach";
  return "healthy";
}

/** For open conversations: elapsed since assignment vs target. */
export function pendingSlaState(elapsedSeconds: number, targetSeconds: number, nearRatio = 0.8): SlaState {
  if (elapsedSeconds > targetSeconds) return "breached";
  if (elapsedSeconds >= targetSeconds * nearRatio) return "near_breach";
  return "healthy";
}
