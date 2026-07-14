/**
 * Date-range presets for the global period filter.
 *
 * The URL carries BOTH the preset key and the resolved from/to:
 *   ?range=this_month&from=<iso>&to=<iso>
 * The key only drives which chip looks active. Every report reads from/to, so a
 * custom range is a first-class citizen rather than a special case — and the
 * server never has to guess the user's month boundaries.
 */

export const RANGE_PRESETS = [
  { key: "today", labelAr: "اليوم" },
  { key: "7d", labelAr: "٧ أيام" },
  { key: "30d", labelAr: "٣٠ يوم" },
  { key: "60d", labelAr: "٦٠ يوم" },
  { key: "90d", labelAr: "٩٠ يوم" },
  { key: "this_month", labelAr: "الشهر الحالي" },
  { key: "last_month", labelAr: "الشهر الماضي" },
] as const;

export type RangeKey = (typeof RANGE_PRESETS)[number]["key"];
/** `custom` is not a preset — it is what the from/to pickers set. */
export type RangeSelection = RangeKey | "custom";

export const DEFAULT_RANGE: RangeKey = "30d";

const startOfDay = (d: Date): Date => {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
};

const endOfDay = (d: Date): Date => {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
};

/** Resolve a preset to a concrete [from, to] in the viewer's local time. */
export function resolveRange(key: RangeKey, now: Date = new Date()): { from: Date; to: Date } {
  switch (key) {
    case "today":
      return { from: startOfDay(now), to: new Date(now) };

    case "this_month":
      return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: new Date(now) };

    case "last_month": {
      const from = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      // Last instant of the previous month — not "today minus a month".
      const to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      return { from, to };
    }

    default: {
      const days = Number(key.replace("d", ""));
      return { from: new Date(now.getTime() - days * 86_400_000), to: new Date(now) };
    }
  }
}

/** `2026-07-14` → a Date, for the <input type="date"> pickers. */
export function parseDateInput(value: string, opts: { endOfDay?: boolean } = {}): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return opts.endOfDay ? endOfDay(d) : startOfDay(d);
}

/** Date → `2026-07-14`, for populating the pickers from the URL. */
export function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
