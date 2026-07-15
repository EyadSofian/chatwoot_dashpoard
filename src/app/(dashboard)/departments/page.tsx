"use client";

import Link from "next/link";
import { useApiData } from "@/lib/client/api";
import type { DepartmentsResult, DepartmentRow } from "@/lib/reporting/departments";
import { Section, LoadingBlock, ErrorState, DepartmentPill, Badge } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { formatDurationShort, formatNumber } from "@/lib/format";
import { useLocale } from "@/lib/i18n";

export default function DepartmentsPage() {
  const { tr } = useLocale();
  const { data, loading, error } = useApiData<DepartmentsResult>("/api/departments");

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState message={error} />;

  const num = (v: number) => <span className="tnum">{formatNumber(v)}</span>;
  const columns: Column<DepartmentRow>[] = [
    { key: "department", header: tr("القسم", "Department"), render: (r) => <DepartmentPill department={r.department} /> },
    { key: "volume", header: tr("المحادثات", "Conversations"), render: (r) => num(r.volume) },
    { key: "avgResponseSeconds", header: tr("متوسط الرد", "Avg response"), render: (r) => <span className="tnum">{formatDurationShort(r.avgResponseSeconds)}</span> },
    { key: "avgResolutionSeconds", header: tr("متوسط الحل", "Avg resolution"), render: (r) => <span className="tnum">{formatDurationShort(r.avgResolutionSeconds)}</span> },
    { key: "open", header: tr("مفتوحة", "Open"), render: (r) => num(r.open) },
    { key: "unresolved", header: tr("غير محلولة", "Unresolved"), render: (r) => num(r.unresolved) },
    { key: "slaBreaches", header: tr("خرق SLA", "SLA breaches"), render: (r) => (r.slaBreaches ? <Badge tone="danger">{formatNumber(r.slaBreaches)}</Badge> : num(0)) },
  ];

  const delayedColumns: Column<DepartmentsResult["topDelayed"][number]>[] = [
    { key: "contactName", header: tr("العميل", "Customer"), render: (r) => <Link href={`/conversations?conv=${r.chatwootId}`} className="font-medium text-primary hover:underline">{r.contactName || `#${r.chatwootId}`}</Link> },
    { key: "department", header: tr("القسم", "Department"), render: (r) => <DepartmentPill department={r.department} /> },
    { key: "assigneeName", header: tr("الموظف", "Agent"), render: (r) => r.assigneeName || "—" },
    { key: "waitingSeconds", header: tr("مدة الانتظار", "Waiting time"), render: (r) => <span className="tnum text-destructive-fg">{formatDurationShort(r.waitingSeconds)}</span> },
  ];

  return (
    <div className="space-y-4">
      <Section title={tr("تقارير الأقسام", "Department reports")} action={<ExportButton dataset="departments" />}>
        <DataTable columns={columns} rows={data?.rows ?? []} getKey={(r) => r.department} />
      </Section>
      <Section title={tr("أكثر المحادثات تأخيرًا", "Most delayed conversations")}>
        <DataTable columns={delayedColumns} rows={data?.topDelayed ?? []} getKey={(r) => r.chatwootId} emptyTitle={tr("لا توجد محادثات متأخرة", "No delayed conversations")} />
      </Section>
    </div>
  );
}
