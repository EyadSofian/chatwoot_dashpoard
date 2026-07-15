"use client";

import Link from "next/link";
import { useApiData } from "@/lib/client/api";
import type { FahdResult } from "@/lib/reporting/fahd";
import { Kpi, Card, CardTitle, Section, LoadingBlock, ErrorState, DepartmentPill, StatusPill } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { formatDurationShort, formatNumber, formatDateTime } from "@/lib/format";
import { useLocale, departmentLabel } from "@/lib/i18n";

export default function FahdPage() {
  const { tr, locale } = useLocale();
  const { data, loading, error } = useApiData<FahdResult>("/api/fahd");

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const noReplyCols: Column<FahdResult["noReplyList"][number]>[] = [
    { key: "contactName", header: tr("العميل", "Customer"), render: (r) => <Link href={`/conversations?conv=${r.chatwootId}`} className="font-medium text-primary hover:underline">{r.contactName || `#${r.chatwootId}`}</Link> },
    { key: "department", header: tr("القسم المُوجَّه", "Routed department"), render: (r) => <DepartmentPill department={r.department} /> },
    { key: "handoffAt", header: tr("وقت التحويل", "Handoff time"), render: (r) => <span className="text-xs text-muted-foreground">{formatDateTime(r.handoffAt)}</span> },
    { key: "status", header: tr("الحالة", "Status"), render: (r) => <StatusPill status={r.status} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label={tr("إجمالي التحويلات", "Total handoffs")} value={formatNumber(data.totalHandoffs)} />
        <Kpi label={tr("دخول بعد الحل", "Reopened after resolve")} value={formatNumber(data.resolvedReentries)} />
        <Kpi label={tr("في الطابور", "In queue")} value={formatNumber(data.queuedUnassigned)} tone="warning" />
        <Kpi label={tr("حصلت على رد", "Got a reply")} value={formatNumber(data.gotAgentReply)} tone="success" />
        <Kpi label={tr("بدون رد موظف", "No agent reply")} value={formatNumber(data.noAgentReply)} tone="danger" />
        <Kpi label={tr("متوسط فهد ← رد", "Avg Fahd → reply")} value={formatDurationShort(data.avgHandoffToReplySeconds)} />
      </div>

      <Card>
        <CardTitle>{tr("التوجيه حسب القسم", "Routing by department")}</CardTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.routedByDepartment.map((d) => (
            <div key={d.department} className="rounded-lg border border-border p-3 text-center">
              <div className="text-2xl font-bold tnum">{formatNumber(d.count)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{departmentLabel(d.department, locale)}</div>
            </div>
          ))}
          {!data.routedByDepartment.length && <div className="col-span-full py-6 text-center text-sm text-muted-foreground">{tr("لا توجد تحويلات من فهد في هذه الفترة.", "No Fahd handoffs in this period.")}</div>}
        </div>
      </Card>

      <Section title={tr("فهد حوّلها ولم يرد عليها موظف", "Fahd handed off, no agent replied")} action={<ExportButton dataset="fahd" />}>
        <DataTable columns={noReplyCols} rows={data.noReplyList} getKey={(r) => r.chatwootId} emptyTitle={tr("لا توجد محادثات بدون رد", "No unanswered conversations")} />
      </Section>
    </div>
  );
}
