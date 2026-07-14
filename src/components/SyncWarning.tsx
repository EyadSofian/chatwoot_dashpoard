"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { FilterOptions } from "@/lib/reporting/filterOptions";

/**
 * Without a metadata sync the agents and teams tables are empty, so those
 * screens look "broken" (no rows) when they are simply un-seeded. Say so.
 */
export function SyncWarning() {
  const { data } = useApiData<FilterOptions>("/api/filters");
  if (!data || data.metadata?.synced !== false) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-card border border-warning/30 bg-warning/5 px-4 py-3">
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning-fg" aria-hidden />
      <p className="flex-1 text-sm font-semibold text-warning-fg">
        شغّل Sync لبيانات Chatwoot عشان تظهر كل الموظفين والتيمات
      </p>
      <Link href="/settings" className="btn-primary shrink-0 px-3 py-1.5 text-xs">
        اذهب للإعدادات
      </Link>
    </div>
  );
}
