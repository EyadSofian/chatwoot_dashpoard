"use client";

import { useRouter } from "next/navigation";
import { useApiData } from "@/lib/client/api";
import type { AgentRow } from "@/lib/reporting/agents";
import { Section, LoadingBlock, ErrorState, Badge } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { formatDurationShort, formatNumber } from "@/lib/format";

export default function AgentsPage() {
  const router = useRouter();
  const { data, loading, error } = useApiData<{ rows: AgentRow[] }>("/api/agents");

  const num = (v: number) => <span className="tnum">{formatNumber(v)}</span>;
  const columns: Column<AgentRow>[] = [
    { key: "name", header: "الموظف", render: (r) => <span className="font-medium text-primary">{r.name}</span> },
    { key: "assigned", header: "مُسند", render: (r) => num(r.assigned) },
    { key: "replied", header: "تم الرد", render: (r) => num(r.replied) },
    { key: "needsReply", header: "تحتاج رد", render: (r) => <span className={r.needsReply ? "tnum text-destructive-fg" : "tnum"}>{formatNumber(r.needsReply)}</span> },
    { key: "open", header: "مفتوحة", render: (r) => num(r.open) },
    { key: "resolved", header: "محلولة", render: (r) => num(r.resolved) },
    { key: "pending", header: "منتظرة", render: (r) => num(r.pending) },
    { key: "unread", header: "غير مقروءة", render: (r) => num(r.unread) },
    { key: "avgResponseSeconds", header: "متوسط الرد", render: (r) => <span className="tnum">{formatDurationShort(r.avgResponseSeconds)}</span> },
    { key: "medianResponseSeconds", header: "الوسيط", render: (r) => <span className="tnum">{formatDurationShort(r.medianResponseSeconds)}</span> },
    { key: "maxResponseSeconds", header: "الأقصى", render: (r) => <span className="tnum">{formatDurationShort(r.maxResponseSeconds)}</span> },
    { key: "slaBreaches", header: "خرق SLA", render: (r) => (r.slaBreaches ? <Badge tone="danger">{formatNumber(r.slaBreaches)}</Badge> : num(0)) },
  ];

  return (
    <Section title="لوحة الموظفين" action={<ExportButton dataset="agents" />}>
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <div className="p-4"><ErrorState message={error} /></div>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          getKey={(r) => r.agentId}
          onRowClick={(r) => router.push(`/agents/${r.agentId}`)}
          emptyTitle="لا يوجد موظفون — نفّذ Backfill أولاً"
        />
      )}
    </Section>
  );
}
