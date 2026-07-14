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
      className="btn-ghost shrink-0 rounded-full px-3 py-1.5 text-xs"
    >
      <Download className="h-3.5 w-3.5" /> {label}
    </a>
  );
}
