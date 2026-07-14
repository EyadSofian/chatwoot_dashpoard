"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { FilterOptions } from "@/lib/reporting/filterOptions";
import { DEPARTMENT_LABELS_AR, STATUS_LABELS_AR, type Department } from "@/lib/constants";
import { cn } from "@/components/ui";

const PRESETS: { label: string; days: number }[] = [
  { label: "اليوم", days: 0 },
  { label: "٧ أيام", days: 7 },
  { label: "٣٠ يوم", days: 30 },
  { label: "٦٠ يوم", days: 60 },
  { label: "٩٠ يوم", days: 90 },
];

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

  const applyPreset = (days: number) => {
    const to = new Date();
    const from = new Date();
    if (days === 0) from.setHours(0, 0, 0, 0);
    else from.setTime(to.getTime() - days * 86400 * 1000);
    setParams({ from: from.toISOString(), to: to.toISOString() });
  };

  const get = (key: string) => searchParams.get(key) ?? "";

  const activePreset = () => {
    const from = searchParams.get("from");
    if (!from) return 30;
    const diff = Math.round((Date.now() - new Date(from).getTime()) / 86400000);
    return PRESETS.find((p) => p.days === diff)?.days ?? -1;
  };

  const activeCount = FILTER_KEYS.filter((k) => searchParams.get(k)).length;

  return (
    <div className="sticky top-[73px] z-20 border-b border-border bg-surface/85 px-5 py-3 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
        {/* Row 1 — range, search, toggle */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex rounded-full border border-border bg-background p-1">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => applyPreset(p.days)}
                className={cn(
                  "cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150",
                  activePreset() === p.days
                    ? "bg-primary text-on-primary shadow-brand"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

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

        {/* Row 2 — the rest, collapsed by default so the page breathes */}
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
