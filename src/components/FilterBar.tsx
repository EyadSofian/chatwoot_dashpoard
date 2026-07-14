"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { FilterOptions } from "@/lib/reporting/filterOptions";
import { DEPARTMENT_LABELS_AR, STATUS_LABELS_AR, type Department } from "@/lib/constants";
import { RANGE_PRESETS, DEFAULT_RANGE, resolveRange, parseDateInput, toDateInput, type RangeKey } from "@/lib/dateRange";
import { cn } from "@/components/ui";

const FILTER_KEYS = [
  "department",
  "teamId",
  "agentId",
  "inboxId",
  "status",
  "campaignSource",
  "campaignLabel",
  "sla",
  "needsReply",
  "search",
];

export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: options } = useApiData<FilterOptions>("/api/filters");
  const [expanded, setExpanded] = useState(false);

  const setParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "" || value === "all") next.delete(key);
        else next.set(key, value);
      }
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const get = (key: string) => searchParams.get(key) ?? "";

  /** Presets write both the key (for the active chip) and the resolved window. */
  const applyPreset = (key: RangeKey) => {
    const { from, to } = resolveRange(key);
    setParams({ range: key, from: from.toISOString(), to: to.toISOString() });
  };

  /** Editing either date field switches the selection to a custom window. */
  const applyCustomDate = (side: "from" | "to", value: string) => {
    if (!value) {
      setParams({ [side]: undefined });
      return;
    }
    const parsed = parseDateInput(value, { endOfDay: side === "to" });
    if (!parsed) return;
    setParams({ range: "custom", [side]: parsed.toISOString() });
  };

  const activeRange = get("range") || DEFAULT_RANGE;
  const activeCount = FILTER_KEYS.filter((k) => searchParams.get(k)).length;

  // Fall back to the default window so the pickers are never blank on first load.
  const fallback = resolveRange(DEFAULT_RANGE);
  const fromValue = toDateInput(get("from") || fallback.from);
  const toValue = toDateInput(get("to") || fallback.to);

  return (
    <div className="sticky top-[73px] z-20 border-b border-border bg-surface/85 px-5 py-3 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
        {/* Period */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-bold text-muted-foreground">الفترة</span>

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

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium">من تاريخ</span>
            <input
              type="date"
              value={fromValue}
              max={toValue || undefined}
              onChange={(e) => applyCustomDate("from", e.target.value)}
              className="cursor-pointer rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
            />
          </label>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium">إلى تاريخ</span>
            <input
              type="date"
              value={toValue}
              min={fromValue || undefined}
              onChange={(e) => applyCustomDate("to", e.target.value)}
              className="cursor-pointer rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
            />
          </label>
        </div>

        {/* Search + filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute inset-y-0 my-auto h-4 w-4 text-muted-foreground"
              style={{ insetInlineStart: 12 }}
              aria-hidden
            />
            <input
              defaultValue={get("search")}
              placeholder="ابحث بالاسم أو الهاتف أو رقم المحادثة"
              onKeyDown={(e) => {
                if (e.key === "Enter") setParams({ search: (e.target as HTMLInputElement).value });
              }}
              onBlur={(e) => setParams({ search: e.target.value })}
              className="input rounded-full py-2 ps-9 text-xs"
              aria-label="بحث"
            />
          </div>

          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className={cn(
              "btn-ghost rounded-full px-3 py-2 text-xs",
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

          {activeCount > 0 && (
            <button
              onClick={() => router.replace(pathname, { scroll: false })}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-destructive-fg"
            >
              <X className="h-3.5 w-3.5" /> مسح
            </button>
          )}
        </div>

        {(expanded || activeCount > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              label="القسم"
              value={get("department")}
              onChange={(v) => setParams({ department: v })}
              options={(options?.departments ?? []).map((d) => ({
                value: d,
                label: DEPARTMENT_LABELS_AR[d as Department] ?? d,
              }))}
            />
            <FilterSelect
              label="الفريق"
              value={get("teamId")}
              onChange={(v) => setParams({ teamId: v })}
              options={(options?.teams ?? []).map((t) => ({ value: String(t.id), label: t.name }))}
            />
            <FilterSelect
              label="الموظف"
              value={get("agentId")}
              onChange={(v) => setParams({ agentId: v })}
              options={(options?.agents ?? []).map((a) => ({ value: String(a.id), label: a.name }))}
            />
            <FilterSelect
              label="القناة"
              value={get("inboxId")}
              onChange={(v) => setParams({ inboxId: v })}
              options={(options?.inboxes ?? []).map((i) => ({ value: String(i.id), label: i.name }))}
            />
            <FilterSelect
              label="الحالة"
              value={get("status")}
              onChange={(v) => setParams({ status: v })}
              options={["open", "pending", "resolved", "snoozed"].map((s) => ({
                value: s,
                label: STATUS_LABELS_AR[s] ?? s,
              }))}
            />
            <FilterSelect
              label="مصدر الكامبين"
              value={get("campaignSource")}
              onChange={(v) => setParams({ campaignSource: v })}
              options={[
                { value: "sales", label: "المبيعات" },
                { value: "operations", label: "العمليات" },
              ]}
            />
            <FilterSelect
              label="الكامبين"
              value={get("campaignLabel")}
              onChange={(v) => setParams({ campaignLabel: v })}
              options={(options?.campaignLabels ?? []).map((l) => ({ value: l, label: l }))}
            />
            <FilterSelect
              label="مستوى الخدمة"
              value={get("sla")}
              onChange={(v) => setParams({ sla: v })}
              options={[
                { value: "breached", label: "خرق" },
                { value: "near_breach", label: "قريبة" },
                { value: "healthy", label: "سليمة" },
              ]}
            />

            <label
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
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
              يحتاج رد فقط
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value || "all"}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "select-chip",
        value ? "border-primary/40 bg-primary/5 text-primary" : "border-border hover:border-primary/30",
      )}
      aria-label={label}
    >
      <option value="all">{label}: الكل</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
