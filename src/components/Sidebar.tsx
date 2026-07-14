"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/constants";
import { NavIcon } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { cn } from "@/components/ui";

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-navy/30 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 z-50 flex w-[264px] shrink-0 flex-col border-s border-border bg-surface transition-transform duration-200",
          "lg:static lg:z-auto lg:translate-x-0",
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
        style={{ insetInlineEnd: 0 }}
      >
        <div className="px-5 py-6">
          <Logo />
          <p className="mt-2 ps-0.5 text-2xs text-muted-foreground">لوحة تحليلات خدمة العملاء</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150",
                  active
                    ? "bg-primary text-on-primary shadow-brand"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <NavIcon
                  name={item.icon}
                  className={cn("h-[18px] w-[18px] shrink-0 transition-colors", active ? "text-on-primary" : "text-muted-foreground group-hover:text-primary")}
                />
                <span className="flex-1">{item.labelAr}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border px-5 py-4">
          <p className="text-2xs text-muted-foreground">
            Engosoft · {new Date().getFullYear()}
          </p>
        </div>
      </aside>
    </>
  );
}
