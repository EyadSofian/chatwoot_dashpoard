"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/components/ui";

export interface Option {
  value: string;
  label: string;
}

/**
 * Multi-select filter. Comparing Sales and Operations side by side should not
 * mean running the report twice, so every list filter takes a set, not one value.
 */
export function MultiSelect({
  label,
  values,
  options,
  onChange,
  block = false,
  searchable,
}: {
  label: string;
  values: string[];
  options: Option[];
  onChange: (next: string[]) => void;
  /** Full-width, 44px tall — the bottom-sheet variant. */
  block?: boolean;
  /** Defaults on once the list is long enough to be worth filtering. */
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement | null>(null);

  const canSearch = searchable ?? options.length > 8;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };

  const shown = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const selectedLabels = options.filter((o) => values.includes(o.value)).map((o) => o.label);

  // One pick reads better as its own name than as "Team (1)".
  const summary =
    selectedLabels.length === 0
      ? label
      : selectedLabels.length === 1
        ? selectedLabels[0]!
        : `${label} · ${selectedLabels.length}`;

  return (
    <div ref={root} className={cn("relative", block && "w-full")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-full border py-1.5 pe-2.5 ps-3 text-xs font-medium transition-colors",
          block && "min-h-11 w-full justify-between rounded-xl text-sm",
          values.length
            ? "border-primary/40 bg-primary/5 text-primary"
            : "border-border bg-surface text-muted-foreground hover:border-primary/30 hover:text-foreground",
        )}
      >
        {/* The summary already carries the count — a badge on top of it would say it twice. */}
        <span className="truncate">{summary}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className={cn(
            "absolute z-50 mt-1.5 max-h-72 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-pop",
            block && "w-full",
          )}
          style={{ insetInlineStart: 0 }}
        >
          {canSearch && (
            <div className="relative border-b border-border">
              <Search
                className="pointer-events-none absolute inset-y-0 my-auto h-3.5 w-3.5 text-muted-foreground"
                style={{ insetInlineStart: 10 }}
                aria-hidden
              />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="بحث"
                className="w-full bg-transparent py-2.5 pe-3 ps-8 text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}

          <ul className="max-h-52 overflow-y-auto overscroll-contain p-1">
            {shown.map((o) => {
              const on = values.includes(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => toggle(o.value)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-start text-xs transition-colors",
                      on ? "bg-primary/5 font-semibold text-primary" : "text-foreground hover:bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        on ? "border-primary bg-primary text-on-primary" : "border-border",
                      )}
                      aria-hidden
                    >
                      {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="truncate">{o.label}</span>
                  </button>
                </li>
              );
            })}
            {!shown.length && (
              <li className="px-2.5 py-3 text-center text-xs text-muted-foreground">لا توجد نتائج</li>
            )}
          </ul>

          {values.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex w-full cursor-pointer items-center justify-center gap-1 border-t border-border py-2 text-2xs font-semibold text-muted-foreground transition-colors hover:text-destructive-fg"
            >
              <X className="h-3 w-3" /> إلغاء التحديد
            </button>
          )}
        </div>
      )}
    </div>
  );
}
