"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { Menu, RefreshCw } from "lucide-react";
import { useState } from "react";
import { NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/components/ui";

/** One line of context under each page title — tells you what you're looking at. */
const SUBTITLE: Record<string, string> = {
  overview: "الأداء العام",
  agents: "أداء الموظفين",
  departments: "مقارنة الأقسام",
  conversations: "كل المحادثات",
  campaigns: "الإرسال والردود",
  sla: "الخروقات والمتأخرات",
  fahd: "تسليمات البوت للموظفين",
  exports: "تصدير CSV بنفس الفلاتر",
  settings: "الربط والمزامنة و SLA",
};

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);

  const active = NAV_ITEMS.find((i) => (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)));
  const title = active?.labelAr ?? "لوحة التحليلات";
  const subtitle = active ? SUBTITLE[active.key] : undefined;

  const refresh = () => {
    setSpinning(true);
    router.refresh();
    window.setTimeout(() => setSpinning(false), 600);
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface/85 px-5 py-4 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onMenu}
          className="cursor-pointer rounded-xl border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
          aria-label="فتح القائمة"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>

      <button
        onClick={refresh}
        className="btn-ghost shrink-0 px-3 py-2 text-xs"
        aria-label="تحديث البيانات"
      >
        <RefreshCw className={cn("h-4 w-4", spinning && "animate-spin")} />
        <span className="hidden sm:inline">تحديث</span>
      </button>
    </header>
  );
}
