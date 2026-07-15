"use client";

import { Download } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "@/lib/i18n";

export function ExportButton({ dataset, label }: { dataset: string; label?: string }) {
  const { tr } = useLocale();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const href = `/api/export/${dataset}${qs ? `?${qs}` : ""}`;
  return (
    <a
      href={href}
      className="btn-ghost shrink-0 rounded-full px-3 py-1.5 text-xs"
    >
      <Download className="h-3.5 w-3.5" /> {label ?? tr("تصدير CSV", "Export CSV")}
    </a>
  );
}
