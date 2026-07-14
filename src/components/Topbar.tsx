"use client";

import { usePathname, useRouter } from "next/navigation";
import { Menu, Moon, Sun, LogOut } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import { useTheme } from "@/components/providers";
import { apiPost } from "@/lib/client/api";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();

  const active = NAV_ITEMS.find((i) => (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)));
  const title = active?.labelAr ?? "لوحة التحليلات";

  const logout = async () => {
    try {
      await apiPost("/api/auth/logout");
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <button onClick={onMenu} className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 lg:hidden cursor-pointer" aria-label="القائمة">
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold tracking-tight">{title}</h1>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={toggle}
          className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground cursor-pointer"
          aria-label={theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          onClick={logout}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-destructive cursor-pointer"
        >
          <LogOut className="h-4 w-4" /> خروج
        </button>
      </div>
    </header>
  );
}
