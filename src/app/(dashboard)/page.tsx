"use client";

import Link from "next/link";
import { useApiData } from "@/lib/client/api";
import type { OverviewResult } from "@/lib/reporting/overview";
import { Kpi, Card, CardTitle, LoadingBlock, ErrorState, EmptyState, DepartmentPill } from "@/components/ui";
import { TrendChart, DeptResponseBar } from "@/components/charts";
import { ExportButton } from "@/components/ExportButton";
import { formatDurationShort, formatNumber, formatPercent } from "@/lib/format";
import { DEPARTMENT_LABELS_AR, CAMPAIGN_SOURCE_LABELS_AR, type Department, type CampaignSource } from "@/lib/constants";

export default function OverviewPage() {
  const { data, loading, error } = useApiData<OverviewResult>("/api/overview");

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <EmptyState title="لا توجد بيانات بعد" hint="ابدأ بعمل Backfill من صفحة الإعدادات لجلب المحادثات." />;

  const k = data.kpis;
  const deptChart = data.responseByDepartment
    .filter((d) => d.avgResponseSeconds !== null)
    .map((d) => ({ department: DEPARTMENT_LABELS_AR[d.department as Department] ?? d.department, avg: d.avgResponseSeconds ?? 0 }));

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <Kpi label="إجمالي المحادثات" value={formatNumber(k.totalConversations)} />
        <Kpi label="مفتوحة الآن" value={formatNumber(k.openNow)} tone="accent" />
        <Kpi label="تحتاج رد" value={formatNumber(k.needsReply)} tone="warning" />
        <Kpi label="متوسط الرد" value={formatDurationShort(k.avgResponseSeconds)} sub={`وسيط ${formatDurationShort(k.medianResponseSeconds)}`} />
        <Kpi label="متوسط الحل" value={formatDurationShort(k.avgResolutionSeconds)} />
        <Kpi label="خرق SLA" value={formatNumber(k.slaBreaches)} tone="danger" />
        <Kpi label="رسائل الكامبين" value={formatNumber(k.campaignsSent)} />
        <Kpi label="ردود الكامبين" value={formatNumber(k.campaignReplies)} tone="success" />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>اتجاه المحادثات اليومي</CardTitle>
          {data.dailyTrend.length ? <TrendChart data={data.dailyTrend} /> : <EmptyState title="لا بيانات" />}
        </Card>
        <Card>
          <CardTitle>زمن الرد حسب القسم</CardTitle>
          {deptChart.length ? <DeptResponseBar data={deptChart} /> : <EmptyState title="لا بيانات" />}
        </Card>
      </div>

      {/* Agent load + late conversations */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>حمل الموظفين</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-2xs uppercase text-muted-foreground">
                  <th className="px-2 py-2 text-start font-medium">الموظف</th>
                  <th className="px-2 py-2 text-start font-medium">مفتوحة</th>
                  <th className="px-2 py-2 text-start font-medium">تحتاج رد</th>
                  <th className="px-2 py-2 text-start font-medium">متوسط الرد</th>
                </tr>
              </thead>
              <tbody>
                {data.agentLoad.map((a) => (
                  <tr key={a.agentId ?? a.name} className="border-b border-border/60 last:border-0 hover:bg-surface-2">
                    <td className="px-2 py-2">
                      {a.agentId ? <Link href={`/agents/${a.agentId}`} className="text-primary hover:underline">{a.name}</Link> : a.name}
                    </td>
                    <td className="px-2 py-2 tnum">{formatNumber(a.open)}</td>
                    <td className="px-2 py-2 tnum">{formatNumber(a.needsReply)}</td>
                    <td className="px-2 py-2 tnum">{formatDurationShort(a.avgResponseSeconds)}</td>
                  </tr>
                ))}
                {!data.agentLoad.length && (
                  <tr>
                    <td colSpan={4}><EmptyState title="لا يوجد موظفون" /></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardTitle action={<ExportButton dataset="conversations" />}>محادثات متأخرة</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-2xs uppercase text-muted-foreground">
                  <th className="px-2 py-2 text-start font-medium">العميل</th>
                  <th className="px-2 py-2 text-start font-medium">القسم</th>
                  <th className="px-2 py-2 text-start font-medium">الموظف</th>
                  <th className="px-2 py-2 text-start font-medium">الانتظار</th>
                </tr>
              </thead>
              <tbody>
                {data.lateConversations.map((c) => (
                  <tr key={c.chatwootId} className="border-b border-border/60 last:border-0 hover:bg-surface-2">
                    <td className="px-2 py-2">
                      <Link href={`/conversations?conv=${c.chatwootId}`} className="text-primary hover:underline">{c.contactName || `#${c.chatwootId}`}</Link>
                    </td>
                    <td className="px-2 py-2"><DepartmentPill department={c.department} /></td>
                    <td className="px-2 py-2 text-muted-foreground">{c.assigneeName || "—"}</td>
                    <td className="px-2 py-2 tnum text-destructive">{formatDurationShort(c.waitingSeconds)}</td>
                  </tr>
                ))}
                {!data.lateConversations.length && (
                  <tr>
                    <td colSpan={4}><EmptyState title="لا توجد محادثات متأخرة" /></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Campaign performance */}
      <Card>
        <CardTitle>أداء الكامبينات</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.campaignPerformance.map((c) => (
            <div key={c.source} className="rounded-lg border border-border p-3">
              <div className="mb-2 text-sm font-semibold">{CAMPAIGN_SOURCE_LABELS_AR[c.source as CampaignSource] ?? c.source}</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><div className="text-lg font-bold tnum">{formatNumber(c.sent)}</div><div className="text-2xs text-muted-foreground">مُرسل</div></div>
                <div><div className="text-lg font-bold tnum text-success">{formatNumber(c.replies)}</div><div className="text-2xs text-muted-foreground">ردود</div></div>
                <div><div className="text-lg font-bold tnum text-primary">{formatPercent(c.replyRate, 1)}</div><div className="text-2xs text-muted-foreground">نسبة الرد</div></div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
