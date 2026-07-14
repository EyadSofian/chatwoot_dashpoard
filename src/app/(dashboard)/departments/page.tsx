"use client";

import Link from "next/link";
import { useApiData } from "@/lib/client/api";
import type { DepartmentsResult, DepartmentRow } from "@/lib/reporting/departments";
import { Section, LoadingBlock, ErrorState, DepartmentPill, Badge } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { formatDurationShort, formatNumber } from "@/lib/format";

export default function DepartmentsPage() {
  const { data, loading, error } = useApiData<DepartmentsResult>("/api/departments");

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState message={error} />;

  const num = (v: number) => <span className="tnum">{formatNumber(v)}</span>;
  const columns: Column<DepartmentRow>[] = [
    { key: "department", header: "القسم", render: (r) => <DepartmentPill department={r.department} /> },
    { key: "volume", header: "المحادثات", render: (r) => num(r.volume) },
    { key: "avgResponseSeconds", header: "متوسط الرد", render: (r) => <span className="tnum">{formatDurationShort(r.avgResponseSeconds)}</span> },
    { key: "avgResolutionSeconds", header: "متوسط الحل", render: (r) => <span className="tnum">{formatDurationShort(r.avgResolutionSeconds)}</span> },
    { key: "open", header: "مفتوحة", render: (r) => num(r.open) },
    { key: "unresolved", header: "غير محلولة", render: (r) => num(r.unresolved) },
    { key: "slaBreaches", header: "خرق SLA", render: (r) => (r.slaBreaches ? <Badge tone="danger">{formatNumber(r.slaBreaches)}</Badge> : num(0)) },
  ];

  const delayedColumns: Column<DepartmentsResult["topDelayed"][number]>[] = [
    { key: "contactName", header: "العميل", render: (r) => <Link href={`/conversations?conv=${r.chatwootId}`} className="font-medium text-primary hover:underline">{r.contactName || `#${r.chatwootId}`}</Link> },
    { key: "department", header: "القسم", render: (r) => <DepartmentPill department={r.department} /> },
    { key: "assigneeName", header: "الموظف", render: (r) => r.assigneeName || "—" },
    { key: "waitingSeconds", header: "مدة الانتظار", render: (r) => <span className="tnum text-destructive">{formatDurationShort(r.waitingSeconds)}</span> },
  ];

  return (
    <div className="space-y-4">
      <Section title="تقارير الأقسام" action={<ExportButton dataset="departments" />}>
        <DataTable columns={columns} rows={data?.rows ?? []} getKey={(r) => r.department} />
      </Section>
      <Section title="أكثر المحادثات تأخيرًا">
        <DataTable columns={delayedColumns} rows={data?.topDelayed ?? []} getKey={(r) => r.chatwootId} emptyTitle="لا توجد محادثات متأخرة" />
      </Section>
    </div>
  );
}
