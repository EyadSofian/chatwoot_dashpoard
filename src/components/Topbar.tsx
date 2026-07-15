"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { Languages, Menu, RefreshCw } from "lucide-react";
import { useState } from "react";
import { NAV_ITEMS } from "@/lib/constants";
import { useLocale } from "@/lib/i18n";
import { cn } from "@/components/ui";

/** One line of context under each page title — [ar, en]. */
const SUBTITLE: Record<string, [string, string]> = {
  overview: ["الأداء العام", "Overall performance"],
  agents: ["أداء الموظفين", "Agent performance"],
  teams: ["أداء التيمات وأعضائها", "Team & member performance"],
  departments: ["مقارنة الأقسام", "Department comparison"],
  conversations: ["كل المحادثات", "All conversations"],
  campaigns: ["الإرسال والردود", "Sends & replies"],
  labels: ["أداء التصنيفات والمقارنة بينها", "Label performance & comparison"],
  sla: ["الخروقات والمتأخرات", "Breaches & backlog"],
  fahd: ["تسليمات البوت للموظفين", "Bot handoffs to agents"],
  exports: ["تصدير CSV بنفس الفلاتر", "CSV export with the same filters"],
  audit: ["مطابقة الأرقام مع Chatwoot", "Reconcile the numbers with Chatwoot"],
  settings: ["الربط والمزامنة و SLA", "Connection, sync & SLA"],
};

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, toggle, tr } = useLocale();
  const [spinning, setSpinning] = useState(false);

  const active = NAV_ITEMS.find((i) => (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)));
  const title = active ? (locale === "ar" ? active.labelAr : active.labelEn) : tr("لوحة التحليلات", "Analytics");
  const subtitle = active && SUBTITLE[active.key] ? SUBTITLE[active.key]![locale === "ar" ? 0 : 1] : undefined;

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
          aria-label={tr("فتح القائمة", "Open menu")}
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Language toggle — shows the language you'd switch TO. */}
        <button
          onClick={toggle}
          className="btn-ghost px-3 py-2 text-xs font-bold"
          aria-label={tr("التبديل إلى الإنجليزية", "Switch to Arabic")}
          title={tr("English", "العربية")}
        >
          <Languages className="h-4 w-4" />
          <span>{locale === "ar" ? "EN" : "ع"}</span>
        </button>

        <button onClick={refresh} className="btn-ghost px-3 py-2 text-xs" aria-label={tr("تحديث البيانات", "Refresh")}>
          <RefreshCw className={cn("h-4 w-4", spinning && "animate-spin")} />
          <span className="hidden sm:inline">{tr("تحديث", "Refresh")}</span>
        </button>
      </div>
    </header>
  );
}
