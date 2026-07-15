"use client";

import Link from "next/link";
import { useApiData } from "@/lib/client/api";
import type { SlaResult } from "@/lib/reporting/sla";
import type { SlaSettings } from "@/lib/settings";
import { Kpi, Card, CardTitle, Section, LoadingBlock, ErrorState, DepartmentPill, StatusPill } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { DonutChart, CHART } from "@/components/charts";
import { ExportButton } from "@/components/ExportButton";
import { formatDurationShort, formatNumber } from "@/lib/format";
import { useLocale } from "@/lib/i18n";

export default function SlaPage() {
  const { tr } = useLocale();
  const { data, loading, error } = useApiData<SlaResult & { settings: SlaSettings }>("/api/sla");

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const donut = [
    { name: tr("خرق", "Breached"), value: data.firstResponse.breached, color: CHART.rose },
    { name: tr("قريبة", "Near breach"), value: data.firstResponse.nearBreach, color: CHART.amber },
    { name: tr("سليمة", "Healthy"), value: data.firstResponse.healthy, color: CHART.emerald },
  ];

  const breachCols: Column<SlaResult["breachedList"][number]>[] = [
    { key: "contactName", header: tr("العميل", "Customer"), render: (r) => <Link href={`/conversations?conv=${r.chatwootId}`} className="font-medium text-primary hover:underline">{r.contactName || `#${r.chatwootId}`}</Link> },
    { key: "assigneeName", header: tr("الموظف", "Agent"), render: (r) => r.assigneeName || "—" },
    { key: "department", header: tr("القسم", "Department"), render: (r) => <DepartmentPill department={r.department} /> },
    { key: "responseSeconds", header: tr("زمن الرد", "Response time"), render: (r) => <span className="tnum text-destructive-fg">{formatDurationShort(r.responseSeconds)}</span> },
    { key: "status", header: tr("الحالة", "Status"), render: (r) => <StatusPill status={r.status} /> },
  ];
  const nearCols: Column<SlaResult["nearBreachList"][number]>[] = [
    { key: "contactName", header: tr("العميل", "Customer"), render: (r) => <Link href={`/conversations?conv=${r.chatwootId}`} className="font-medium text-primary hover:underline">{r.contactName || `#${r.chatwootId}`}</Link> },
    { key: "assigneeName", header: tr("الموظف", "Agent"), render: (r) => r.assigneeName || "—" },
    { key: "department", header: tr("القسم", "Department"), render: (r) => <DepartmentPill department={r.department} /> },
    { key: "waitingSeconds", header: tr("مدة الانتظار", "Waiting time"), render: (r) => <span className="tnum text-warning-fg">{formatDurationShort(r.waitingSeconds)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Kpi label={tr("خرق SLA (الرد الأول)", "SLA breaches (first response)")} value={formatNumber(data.firstResponse.breached)} tone="danger" />
        <Kpi label={tr("قريبة من الخرق", "Near breach")} value={formatNumber(data.firstResponse.nearBreach)} tone="warning" />
        <Kpi label={tr("سليمة", "Healthy")} value={formatNumber(data.firstResponse.healthy)} tone="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle>{tr("توزيع الرد الأول", "First-response distribution")}</CardTitle>
          <DonutChart data={donut} />
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle>{tr("الأهداف الحالية", "Current targets")}</CardTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Target label={tr("هدف الرد الأول", "First-response target")} value={`${formatNumber(data.settings.firstResponseMinutes)} ${tr("دقيقة", "min")}`} />
            <Target label={tr("هدف الحل", "Resolution target")} value={`${formatNumber(data.settings.resolutionHours)} ${tr("ساعة", "h")}`} />
            <Target label={tr("المنطقة الزمنية", "Timezone")} value={data.settings.businessHours.timezone} />
            <Target label={tr("ساعات العمل", "Business hours")} value={`${data.settings.businessHours.start}–${data.settings.businessHours.end}`} />
          </div>
          <div className="mt-4 text-xs text-muted-foreground">
            {tr("لتعديل الأهداف انتقل إلى", "To change the targets, go to")} <Link href="/settings" className="text-primary hover:underline">{tr("الإعدادات", "Settings")}</Link>.
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg border border-border p-2"><div className="text-lg font-bold tnum text-destructive-fg">{formatNumber(data.resolution.breached)}</div><div className="text-2xs text-muted-foreground">{tr("خرق الحل", "Resolution breached")}</div></div>
            <div className="rounded-lg border border-border p-2"><div className="text-lg font-bold tnum text-warning-fg">{formatNumber(data.resolution.nearBreach)}</div><div className="text-2xs text-muted-foreground">{tr("قريبة", "Near breach")}</div></div>
            <div className="rounded-lg border border-border p-2"><div className="text-lg font-bold tnum text-success-fg">{formatNumber(data.resolution.healthy)}</div><div className="text-2xs text-muted-foreground">{tr("سليمة", "Healthy")}</div></div>
          </div>
        </Card>
      </div>

      <Section title={tr("محادثات خارقة للـ SLA", "SLA-breaching conversations")} action={<ExportButton dataset="sla" />}>
        <DataTable columns={breachCols} rows={data.breachedList} getKey={(r) => r.chatwootId} emptyTitle={tr("لا يوجد خرق", "No breaches")} />
      </Section>
      <Section title={tr("قريبة من الخرق", "Near breach")}>
        <DataTable columns={nearCols} rows={data.nearBreachList} getKey={(r) => r.chatwootId} emptyTitle={tr("لا توجد محادثات قريبة من الخرق", "No conversations near breach")} />
      </Section>
    </div>
  );
}

function Target({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-2xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-bold">{value}</div>
    </div>
  );
}
