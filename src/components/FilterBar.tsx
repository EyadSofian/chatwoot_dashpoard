"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
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

export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: options } = useApiData<FilterOptions>("/api/filters");

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
    const match = PRESETS.find((p) => p.days === diff);
    return match?.days ?? -1;
  };
  const hasFilters = ["department", "teamId", "agentId", "inboxId", "status", "campaignSource", "campaignLabel", "sla", "needsReply", "search"].some(
    (k) => searchParams.get(k),
  );

  return (
    <div className="flex flex-col gap-2 border-b border-border bg-surface/80 px-4 py-2.5 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border bg-background p-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => applyPreset(p.days)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                activePreset() === p.days ? "bg-primary text-on-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 my-auto h-4 w-4 text-muted-foreground" style={{ insetInlineStart: 10 }} />
          <input
            defaultValue={get("search")}
            placeholder="بحث بالاسم أو الهاتف أو رقم المحادثة"
            onKeyDown={(e) => {
              if (e.key === "Enter") setParams({ search: (e.target as HTMLInputElement).value });
            }}
            onBlur={(e) => setParams({ search: e.target.value })}
            className="input w-64 ps-8"
          />
        </div>

        {hasFilters && (
          <button
            onClick={() => router.replace(pathname, { scroll: false })}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-destructive cursor-pointer"
          >
            <X className="h-3.5 w-3.5" /> مسح الفلاتر
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect label="القسم" value={get("department")} onChange={(v) => setParams({ department: v })}
          options={(options?.departments ?? []).map((d) => ({ value: d, label: DEPARTMENT_LABELS_AR[d as Department] ?? d }))} />
        <FilterSelect label="الفريق" value={get("teamId")} onChange={(v) => setParams({ teamId: v })}
          options={(options?.teams ?? []).map((t) => ({ value: String(t.id), label: t.name }))} />
        <FilterSelect label="الموظف" value={get("agentId")} onChange={(v) => setParams({ agentId: v })}
          options={(options?.agents ?? []).map((a) => ({ value: String(a.id), label: a.name }))} />
        <FilterSelect label="القناة" value={get("inboxId")} onChange={(v) => setParams({ inboxId: v })}
          options={(options?.inboxes ?? []).map((i) => ({ value: String(i.id), label: i.name }))} />
        <FilterSelect label="الحالة" value={get("status")} onChange={(v) => setParams({ status: v })}
          options={["open", "pending", "resolved", "snoozed"].map((s) => ({ value: s, label: STATUS_LABELS_AR[s] ?? s }))} />
        <FilterSelect label="مصدر الكامبين" value={get("campaignSource")} onChange={(v) => setParams({ campaignSource: v })}
          options={[{ value: "sales", label: "المبيعات" }, { value: "operations", label: "العمليات" }]} />
        <FilterSelect label="الكامبين" value={get("campaignLabel")} onChange={(v) => setParams({ campaignLabel: v })}
          options={(options?.campaignLabels ?? []).map((l) => ({ value: l, label: l }))} />
        <FilterSelect label="مستوى الخدمة" value={get("sla")} onChange={(v) => setParams({ sla: v })}
          options={[{ value: "breached", label: "خرق" }, { value: "near_breach", label: "قريبة" }, { value: "healthy", label: "سليمة" }]} />
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs">
          <input type="checkbox" checked={get("needsReply") === "true"} onChange={(e) => setParams({ needsReply: e.target.checked ? "true" : undefined })} />
          يحتاج رد فقط
        </label>
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
        "rounded-lg border bg-surface px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none cursor-pointer",
        value ? "border-primary/50" : "border-border",
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
