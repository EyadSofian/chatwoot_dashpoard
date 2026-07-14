"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/constants";
import { NavIcon } from "@/components/icons";
import { cn } from "@/components/ui";

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cn(
          "fixed inset-y-0 z-50 flex w-60 shrink-0 flex-col border-s border-border bg-surface transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0",
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
        style={{ insetInlineEnd: 0 }}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-on-primary">
            <span className="text-sm font-bold">إن</span>
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">تحليلات إنجوسوفت</div>
            <div className="truncate text-2xs text-muted-foreground">Chatwoot Analytics</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              onClick={onClose}
              className={cn(
                "mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.href) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <NavIcon name={item.icon} className="h-[18px] w-[18px]" />
              <span className="flex-1">{item.labelAr}</span>
              <span className="text-2xs text-muted-foreground/70">{item.labelEn}</span>
            </Link>
          ))}
        </nav>

        <div className="border-t border-border px-4 py-3 text-2xs text-muted-foreground">Engosoft · {new Date().getFullYear()}</div>
      </aside>
    </>
  );
}
