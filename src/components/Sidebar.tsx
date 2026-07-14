"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, NAV_GROUPS } from "@/lib/constants";
import { NavIcon } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { useApiData } from "@/lib/client/api";
import type { FilterOptions } from "@/lib/reporting/filterOptions";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/components/ui";

const BY_KEY = new Map(NAV_ITEMS.map((i) => [i.key, i]));

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { data, error } = useApiData<FilterOptions>("/api/filters");

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-navy/30 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 z-50 flex w-[260px] shrink-0 flex-col border-s border-border bg-surface transition-transform duration-200",
          "lg:static lg:z-auto lg:translate-x-0",
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
        style={{ insetInlineEnd: 0 }}
      >
        {/* Identity */}
        <div className="border-b border-border px-5 py-5">
          <Logo />
          <p className="mt-2 truncate text-2xs text-muted-foreground">لوحة تحليلات خدمة العملاء</p>
        </div>

        {/* Grouped nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.titleAr} className={cn(gi > 0 && "mt-5")}>
              <div className="mb-1.5 px-3 text-2xs font-bold uppercase tracking-wider text-muted-foreground/70">
                {group.titleAr}
              </div>
              <ul className="space-y-0.5">
                {group.keys.map((key) => {
                  const item = BY_KEY.get(key);
                  if (!item) return null;
                  const active = isActive(item.href);
                  return (
                    <li key={key}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-150",
                          active
                            ? "bg-primary text-on-primary shadow-brand"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <NavIcon
                          name={item.icon}
                          className={cn(
                            "h-[18px] w-[18px] shrink-0 transition-colors",
                            active ? "text-on-primary" : "text-muted-foreground group-hover:text-primary",
                          )}
                        />
                        <span className="truncate">{item.labelAr}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Status */}
        <div className="border-t border-border px-5 py-4">
          <dl className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-2xs text-muted-foreground">حالة الاتصال</dt>
              <dd className="flex items-center gap-1.5 text-2xs font-semibold">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    error ? "bg-destructive" : data ? "bg-success" : "bg-muted-foreground/40",
                  )}
                  aria-hidden
                />
                <span className={error ? "text-destructive-fg" : data ? "text-success-fg" : "text-muted-foreground"}>
                  {error ? "منقطع" : data ? "متصل" : "جارٍ…"}
                </span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="shrink-0 text-2xs text-muted-foreground">آخر تحديث</dt>
              <dd className="truncate text-2xs font-medium text-foreground">
                {data?.metadata?.lastSyncAt ? formatDateTime(data.metadata.lastSyncAt) : "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-2xs text-muted-foreground">Engosoft · {new Date().getFullYear()}</p>
        </div>
      </aside>
    </>
  );
}
