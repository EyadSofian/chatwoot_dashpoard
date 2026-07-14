"use client";

import { useState } from "react";
import { useApiData } from "@/lib/client/api";
import type { CampaignRow } from "@/lib/reporting/campaigns";
import { Kpi, Section, LoadingBlock, ErrorState, Badge, cn } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { CampaignDrawer } from "@/components/CampaignDrawer";
import { formatDurationShort, formatNumber, formatPercent } from "@/lib/format";

const TABS = [
  { key: "all", label: "الكل" },
  { key: "sales", label: "كامبينات المبيعات" },
  { key: "operations", label: "كامبينات العمليات" },
] as const;

const BUCKET_TONE: Record<string, "success" | "primary" | "warning" | "danger" | "muted"> = {
  completed: "success",
  running: "primary",
  pending: "warning",
  failed: "danger",
  stopped: "muted",
};

export default function CampaignsPage() {
  const { data, loading, error } = useApiData<{ rows: CampaignRow[]; totals: { sent: number; failed: number; replies: number } }>("/api/campaigns");
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [selected, setSelected] = useState<{ source: string; jobId: string } | null>(null);

  const rows = (data?.rows ?? []).filter((r) => tab === "all" || r.sourceKey === tab);

  const columns: Column<CampaignRow>[] = [
    { key: "label", header: "الكامبين", render: (r) => <span className="font-medium">{r.label || "—"}</span> },
    { key: "operatorName", header: "مين عمل الكامبين", render: (r) => <span className="font-semibold text-primary">{r.operatorName || "—"}</span> },
    { key: "template", header: "القالب", render: (r) => <span className="text-xs text-muted-foreground">{r.template || "—"}</span> },
    { key: "sourceKey", header: "المصدر", render: (r) => <Badge tone="muted">{r.sourceKey === "sales" ? "مبيعات" : "عمليات"}</Badge> },
    { key: "status", header: "الحالة", render: (r) => <Badge tone={BUCKET_TONE[r.statusBucket ?? "muted"] ?? "muted"}>{r.status || "—"}</Badge> },
    { key: "total", header: "الإجمالي", render: (r) => <span className="tnum">{formatNumber(r.total)}</span> },
    { key: "sent", header: "مُرسل", render: (r) => <span className="tnum text-success-fg">{formatNumber(r.sent)}</span> },
    { key: "failed", header: "فشل", render: (r) => <span className="tnum text-destructive-fg">{formatNumber(r.failed)}</span> },
    { key: "replies", header: "ردود", render: (r) => <span className="tnum">{formatNumber(r.replies)}</span> },
    { key: "replyRate", header: "نسبة الرد", render: (r) => <span className="tnum text-primary">{formatPercent(r.replyRate, 1)}</span> },
    { key: "assignedReplies", header: "مُسندة", render: (r) => <span className="tnum">{formatNumber(r.assignedReplies)}</span> },
    { key: "unassignedReplies", header: "غير مُسندة", render: (r) => <span className="tnum">{formatNumber(r.unassignedReplies)}</span> },
    { key: "avgReplyResponseSeconds", header: "متوسط رد الموظف", render: (r) => <span className="tnum">{formatDurationShort(r.avgReplyResponseSeconds)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="إجمالي المُرسل" value={formatNumber(data?.totals.sent ?? 0)} />
        <Kpi label="إجمالي الفشل" value={formatNumber(data?.totals.failed ?? 0)} tone="danger" />
        <Kpi label="إجمالي الردود" value={formatNumber(data?.totals.replies ?? 0)} tone="success" />
      </div>

      <Section
        title="الكامبينات"
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border bg-background p-0.5">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer", tab === t.key ? "bg-primary text-on-primary" : "text-muted-foreground hover:text-foreground")}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <ExportButton dataset="campaigns" />
          </div>
        }
      >
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="p-4"><ErrorState message={error} /></div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getKey={(r) => `${r.sourceKey}:${r.jobId}`}
            onRowClick={(r) => setSelected({ source: r.sourceKey, jobId: r.jobId })}
            emptyTitle="لا توجد كامبينات — نفّذ مزامنة الكامبينات من الإعدادات"
          />
        )}
      </Section>

      {selected && <CampaignDrawer source={selected.source} jobId={selected.jobId} onClose={() => setSelected(null)} />}
    </div>
  );
}
