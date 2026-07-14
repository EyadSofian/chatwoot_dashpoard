"use client";

import Link from "next/link";
import { useApiData } from "@/lib/client/api";
import type { FahdResult } from "@/lib/reporting/fahd";
import { Kpi, Card, CardTitle, Section, LoadingBlock, ErrorState, DepartmentPill, StatusPill } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { formatDurationShort, formatNumber } from "@/lib/format";
import { DEPARTMENT_LABELS_AR, type Department } from "@/lib/constants";

export default function FahdPage() {
  const { data, loading, error } = useApiData<FahdResult>("/api/fahd");

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const noReplyCols: Column<FahdResult["noReplyList"][number]>[] = [
    { key: "contactName", header: "العميل", render: (r) => <Link href={`/conversations?conv=${r.chatwootId}`} className="font-medium text-primary hover:underline">{r.contactName || `#${r.chatwootId}`}</Link> },
    { key: "department", header: "القسم المُوجَّه", render: (r) => <DepartmentPill department={r.department} /> },
    { key: "handoffAt", header: "وقت التحويل", render: (r) => <span className="text-xs text-muted-foreground">{new Date(r.handoffAt).toLocaleString("ar-EG")}</span> },
    { key: "status", header: "الحالة", render: (r) => <StatusPill status={r.status} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="إجمالي التحويلات" value={formatNumber(data.totalHandoffs)} />
        <Kpi label="دخول بعد الحل" value={formatNumber(data.resolvedReentries)} />
        <Kpi label="في الطابور" value={formatNumber(data.queuedUnassigned)} tone="warning" />
        <Kpi label="حصلت على رد" value={formatNumber(data.gotAgentReply)} tone="success" />
        <Kpi label="بدون رد موظف" value={formatNumber(data.noAgentReply)} tone="danger" />
        <Kpi label="متوسط فهد ← رد" value={formatDurationShort(data.avgHandoffToReplySeconds)} />
      </div>

      <Card>
        <CardTitle>التوجيه حسب القسم</CardTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.routedByDepartment.map((d) => (
            <div key={d.department} className="rounded-lg border border-border p-3 text-center">
              <div className="text-2xl font-bold tnum">{formatNumber(d.count)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{DEPARTMENT_LABELS_AR[d.department as Department] ?? d.department}</div>
            </div>
          ))}
          {!data.routedByDepartment.length && <div className="col-span-full py-6 text-center text-sm text-muted-foreground">لا توجد تحويلات من فهد في هذه الفترة.</div>}
        </div>
      </Card>

      <Section title="فهد حوّلها ولم يرد عليها موظف" action={<ExportButton dataset="fahd" />}>
        <DataTable columns={noReplyCols} rows={data.noReplyList} getKey={(r) => r.chatwootId} emptyTitle="لا توجد محادثات بدون رد" />
      </Section>
    </div>
  );
}
