"use client";

import { useEffect, useRef } from "react";
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

/** Kept in one place — the shell reserves exactly this much room for the rail. */
export const SIDEBAR_WIDTH = 272;

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { data, error } = useApiData<FilterOptions>("/api/filters");
  const panel = useRef<HTMLElement | null>(null);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  // Escape closes the drawer, and while it is open the page behind must not
  // scroll — otherwise the body slides around under the overlay on mobile.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  return (
    <>
      {/* Overlay: drawer only. Never rendered on desktop, where the rail is permanent. */}
      <div
        onClick={onClose}
        aria-hidden
        className={cn(
          "fixed inset-0 z-40 bg-navy/40 backdrop-blur-sm transition-opacity duration-200 lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        ref={panel}
        tabIndex={-1}
        aria-label="القائمة الجانبية"
        // `fixed` at EVERY breakpoint — the rail must not scroll away with the
        // page. On desktop it is simply always visible; the shell reserves
        // SIDEBAR_WIDTH so nothing ever sits underneath it.
        //
        // RTL: the inline axis runs right→left, so `start-0` is the RIGHT edge
        // (`end-0` would pin it to the left) and `border-e` puts the divider on
        // the side that faces the content. Hidden off-canvas by translating it
        // out past that right edge.
        className={cn(
          "fixed inset-y-0 start-0 z-50 flex h-[100dvh] flex-col border-e border-border bg-surface outline-none",
          "transition-transform duration-200 will-change-transform",
          open ? "translate-x-0" : "translate-x-full",
          "lg:translate-x-0",
        )}
        style={{ width: SIDEBAR_WIDTH }}
      >
        {/* Identity — fixed head */}
        <div className="shrink-0 border-b border-border px-5 py-5">
          <Logo />
          <p className="mt-2 truncate text-2xs text-muted-foreground">تحليلات خدمة العملاء</p>
        </div>

        {/* Only THIS scrolls, never the page */}
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
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
                        // min-h-11 = 44px touch target.
                        className={cn(
                          "group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-all duration-150",
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

        {/* Status — pinned foot */}
        <div className="shrink-0 border-t border-border px-5 py-4">
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
