"use client";

import { Download } from "lucide-react";
import { useSearchParams } from "next/navigation";

export function ExportButton({ dataset, label = "تصدير CSV" }: { dataset: string; label?: string }) {
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const href = `/api/export/${dataset}${qs ? `?${qs}` : ""}`;
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
    >
      <Download className="h-3.5 w-3.5" /> {label}
    </a>
  );
}
