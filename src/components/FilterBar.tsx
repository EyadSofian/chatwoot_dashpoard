"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { FilterOptions } from "@/lib/reporting/filterOptions";
import { DEPARTMENT_LABELS_AR, STATUS_LABELS_AR, type Department } from "@/lib/constants";
import { RANGE_PRESETS, DEFAULT_RANGE, resolveRange, parseDateInput, toDateInput, type RangeKey } from "@/lib/dateRange";
import { MultiSelect, type Option } from "@/components/MultiSelect";
import { cn } from "@/components/ui";

const FILTER_KEYS = [
  "department",
  "teamId",
  "agentId",
  "inboxId",
  "status",
  "campaignSource",
  "campaignLabel",
  "label",
  "sla",
  "needsReply",
  "search",
];

export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: options } = useApiData<FilterOptions>("/api/filters");
  const [sheet, setSheet] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const setParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const get = (key: string) => searchParams.get(key) ?? "";
  /** Multi-select values live in the URL comma-separated. */
  const getList = (key: string) => (get(key) ? get(key).split(",").filter(Boolean) : []);
  const setList = (key: string, values: string[]) => setParams({ [key]: values.length ? values.join(",") : undefined });

  const applyPreset = (key: RangeKey) => {
    const { from, to } = resolveRange(key);
    setParams({ range: key, from: from.toISOString(), to: to.toISOString() });
  };

  const applyCustomDate = (side: "from" | "to", value: string) => {
    if (!value) return setParams({ [side]: undefined });
    const parsed = parseDateInput(value, { endOfDay: side === "to" });
    if (parsed) setParams({ range: "custom", [side]: parsed.toISOString() });
  };

  const activeRange = get("range") || DEFAULT_RANGE;
  const activeCount = FILTER_KEYS.reduce((n, k) => n + (searchParams.get(k) ? getList(k).length || 1 : 0), 0);

  const fallback = resolveRange(DEFAULT_RANGE);
  const fromValue = toDateInput(get("from") || fallback.from);
  const toValue = toDateInput(get("to") || fallback.to);

  const opt = (o: FilterOptions | null) => ({
    department: (o?.departments ?? []).map((d) => ({ value: d, label: DEPARTMENT_LABELS_AR[d as Department] ?? d })),
    teamId: (o?.teams ?? []).map((t) => ({ value: String(t.id), label: t.name })),
    agentId: (o?.agents ?? []).map((a) => ({ value: String(a.id), label: a.name })),
    inboxId: (o?.inboxes ?? []).map((i) => ({ value: String(i.id), label: i.name })),
    status: ["open", "pending", "resolved", "snoozed"].map((s) => ({ value: s, label: STATUS_LABELS_AR[s] ?? s })),
    campaignSource: [
      { value: "sales", label: "المبيعات" },
      { value: "operations", label: "العمليات" },
    ],
    campaignLabel: (o?.campaignLabels ?? []).map((l) => ({ value: l, label: l })),
    label: (o?.labels ?? []).map((l) => ({ value: l.title, label: l.title })),
    sla: [
      { value: "breached", label: "خرق" },
      { value: "near_breach", label: "قريب" },
      { value: "healthy", label: "سليم" },
    ],
  });

  const O = opt(options ?? null);

  const FIELDS: { key: string; label: string; options: Option[] }[] = [
    { key: "department", label: "القسم", options: O.department },
    { key: "teamId", label: "التيم", options: O.teamId },
    { key: "agentId", label: "الموظف", options: O.agentId },
    { key: "inboxId", label: "Inbox", options: O.inboxId },
    { key: "status", label: "الحالة", options: O.status },
    { key: "campaignSource", label: "مصدر الكامبين", options: O.campaignSource },
    { key: "campaignLabel", label: "الكامبين", options: O.campaignLabel },
    { key: "label", label: "Labels", options: O.label },
    { key: "sla", label: "SLA", options: O.sla },
  ];

  const needsReplyToggle = (block = false) => (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        block && "min-h-11 w-full rounded-xl text-sm",
        get("needsReply") === "true"
          ? "border-destructive/30 bg-destructive/5 text-destructive-fg"
          : "border-border bg-surface text-muted-foreground hover:text-foreground",
      )}
    >
      <input
        type="checkbox"
        className="h-3.5 w-3.5 cursor-pointer accent-current"
        checked={get("needsReply") === "true"}
        onChange={(e) => setParams({ needsReply: e.target.checked ? "true" : undefined })}
      />
      يحتاج رد
    </label>
  );

  return (
    <div className="sticky top-[73px] z-20 border-b border-border bg-surface/85 px-4 py-3 backdrop-blur-md sm:px-5">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
        {/* Period */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="hidden text-xs font-bold text-muted-foreground sm:inline">الفترة</span>

          <div className="flex flex-wrap gap-1 rounded-full border border-border bg-background p-1">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className={cn(
                  "cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150",
                  activeRange === p.key
                    ? "bg-primary text-on-primary shadow-brand"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.labelAr}
              </button>
            ))}
            {activeRange === "custom" && (
              <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary shadow-brand">
                مخصص
              </span>
            )}
          </div>

          <div className="hidden items-center gap-2 xl:flex">
            <input
              type="date"
              value={fromValue}
              max={toValue || undefined}
              onChange={(e) => applyCustomDate("from", e.target.value)}
              aria-label="من تاريخ"
              className="cursor-pointer rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
            />
            <span className="text-xs text-muted-foreground">—</span>
            <input
              type="date"
              value={toValue}
              min={fromValue || undefined}
              onChange={(e) => applyCustomDate("to", e.target.value)}
              aria-label="إلى تاريخ"
              className="cursor-pointer rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
            />
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute inset-y-0 my-auto h-4 w-4 text-muted-foreground"
              style={{ insetInlineStart: 12 }}
              aria-hidden
            />
            <input
              defaultValue={get("search")}
              placeholder="الاسم أو الهاتف أو رقم المحادثة"
              onKeyDown={(e) => {
                if (e.key === "Enter") setParams({ search: (e.target as HTMLInputElement).value });
              }}
              onBlur={(e) => setParams({ search: e.target.value })}
              className="input rounded-full py-2 ps-9 text-xs"
              aria-label="بحث"
            />
          </div>

          {/* Desktop toggles the inline row; mobile opens the sheet. */}
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className={cn(
              "btn-ghost hidden rounded-full px-3 py-2 text-xs lg:inline-flex",
              (expanded || activeCount > 0) && "border-primary/30 bg-primary/5 text-primary",
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            فلاتر
            {activeCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-bold text-on-primary tnum">
                {activeCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setSheet(true)}
            className={cn(
              "btn-ghost rounded-full px-3 py-2 text-xs lg:hidden",
              activeCount > 0 && "border-primary/30 bg-primary/5 text-primary",
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            فلترة
            {activeCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-bold text-on-primary tnum">
                {activeCount}
              </span>
            )}
          </button>

          {activeCount > 0 && (
            <button
              onClick={() => router.replace(pathname, { scroll: false })}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-destructive-fg"
            >
              <X className="h-3.5 w-3.5" /> مسح
            </button>
          )}
        </div>

        {/* Desktop filter row */}
        {(expanded || activeCount > 0) && (
          <div className="hidden flex-wrap items-center gap-2 lg:flex">
            {FIELDS.map((f) => (
              <MultiSelect
                key={f.key}
                label={f.label}
                values={getList(f.key)}
                options={f.options}
                onChange={(v) => setList(f.key, v)}
              />
            ))}
            {needsReplyToggle()}
          </div>
        )}
      </div>

      {/* Mobile bottom sheet */}
      {sheet && (
        <div className="lg:hidden">
          <div className="fixed inset-0 z-40 bg-navy/40 backdrop-blur-sm" onClick={() => setSheet(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="فلترة"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-5 pb-8 shadow-pop"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold">فلترة</h2>
              <button
                onClick={() => setSheet(false)}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-border text-muted-foreground"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Custom dates live here on mobile — no room for them in the bar. */}
            <div className="mb-3 grid grid-cols-2 gap-2.5">
              <label className="text-2xs font-semibold text-muted-foreground">
                من
                <input
                  type="date"
                  value={fromValue}
                  max={toValue || undefined}
                  onChange={(e) => applyCustomDate("from", e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </label>
              <label className="text-2xs font-semibold text-muted-foreground">
                إلى
                <input
                  type="date"
                  value={toValue}
                  min={fromValue || undefined}
                  onChange={(e) => applyCustomDate("to", e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <MultiSelect
                  key={f.key}
                  label={f.label}
                  values={getList(f.key)}
                  options={f.options}
                  onChange={(v) => setList(f.key, v)}
                  block
                />
              ))}
              {needsReplyToggle(true)}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => {
                  router.replace(pathname, { scroll: false });
                  setSheet(false);
                }}
                className="btn-ghost min-h-11 flex-1"
              >
                مسح الكل
              </button>
              <button onClick={() => setSheet(false)} className="btn-primary min-h-11 flex-1">
                تطبيق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
