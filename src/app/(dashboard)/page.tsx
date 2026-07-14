"use client";

import Link from "next/link";
import { AlertTriangle, Clock, CheckCircle2, MessageSquare, Megaphone, Reply, Timer, Users } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { OverviewResult } from "@/lib/reporting/overview";
import {
  Avatar,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  MiniStat,
  Section,
  SkeletonCards,
  StatTile,
  DepartmentPill,
} from "@/components/ui";
import { TrendChart, DeptResponseBar } from "@/components/charts";
import { ExportButton } from "@/components/ExportButton";
import { formatDurationShort, formatNumber, formatPercent } from "@/lib/format";
import {
  DEPARTMENT_LABELS_AR,
  CAMPAIGN_SOURCE_LABELS_AR,
  type Department,
  type CampaignSource,
} from "@/lib/constants";

export default function OverviewPage() {
  const { data, loading, error } = useApiData<OverviewResult>("/api/overview");

  if (loading) {
    return (
      <div className="space-y-5">
        <SkeletonCards count={4} />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="card h-[360px] animate-pulse bg-surface-2/60 lg:col-span-2" />
          <div className="card h-[360px] animate-pulse bg-surface-2/60" />
        </div>
      </div>
    );
  }
  if (error) return <ErrorState message={error} />;
  if (!data) {
    return (
      <EmptyState
        title="لا توجد بيانات بعد"
        hint="ابدأ بعمل Backfill من صفحة الإعدادات لجلب المحادثات، أو اربط الويبهوك عشان البيانات تدخل مباشرة."
      />
    );
  }

  const k = data.kpis;
  const deptChart = data.responseByDepartment
    .filter((d) => d.avgResponseSeconds !== null)
    .map((d) => ({
      department: DEPARTMENT_LABELS_AR[d.department as Department] ?? d.department,
      avg: d.avgResponseSeconds ?? 0,
    }));

  return (
    <div className="space-y-5">
      {/* ── Headline KPIs — four, big, one glance ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="إجمالي المحادثات"
          value={formatNumber(k.totalConversations)}
          icon={<MessageSquare className="h-[18px] w-[18px]" />}
          tone="brand"
          sub={`${formatNumber(k.openNow)} مفتوحة الآن`}
        />
        <StatTile
          label="متوسط زمن الرد"
          value={formatDurationShort(k.avgResponseSeconds)}
          icon={<Timer className="h-[18px] w-[18px]" />}
          tone="violet"
          sub={`الوسيط ${formatDurationShort(k.medianResponseSeconds)} · من لحظة الإسناد`}
        />
        <StatTile
          label="تحتاج رد"
          value={formatNumber(k.needsReply)}
          icon={<Reply className="h-[18px] w-[18px]" />}
          tone="warning"
          sub="العميل اتكلم آخر حاجة ومحدش رد"
        />
        <StatTile
          label="خرق مستوى الخدمة"
          value={formatNumber(k.slaBreaches)}
          icon={<AlertTriangle className="h-[18px] w-[18px]" />}
          tone="danger"
          sub={<Link href="/sla" className="font-semibold text-primary hover:underline">عرض التفاصيل ←</Link>}
        />
      </div>

      {/* ── Secondary strip ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="متوسط زمن الحل"
          value={formatDurationShort(k.avgResolutionSeconds)}
          icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
          tone="success"
        />
        <StatTile
          label="مفتوحة الآن"
          value={formatNumber(k.openNow)}
          icon={<Clock className="h-[18px] w-[18px]" />}
          tone="brand"
        />
        <StatTile
          label="رسائل الكامبين"
          value={formatNumber(k.campaignsSent)}
          icon={<Megaphone className="h-[18px] w-[18px]" />}
          tone="violet"
        />
        <StatTile
          label="ردود الكامبين"
          value={formatNumber(k.campaignReplies)}
          icon={<Users className="h-[18px] w-[18px]" />}
          tone="success"
        />
      </div>

      {/* ── Charts ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle hint="المحادثات الجديدة مقابل المحلولة كل يوم">اتجاه المحادثات</CardTitle>
          {data.dailyTrend.length ? <TrendChart data={data.dailyTrend} /> : <EmptyState title="لا توجد بيانات في الفترة دي" />}
        </Card>

        <Card>
          <CardTitle hint="متوسط الرد من لحظة الإسناد">زمن الرد حسب القسم</CardTitle>
          {deptChart.length ? <DeptResponseBar data={deptChart} /> : <EmptyState title="لا توجد بيانات" />}
        </Card>
      </div>

      {/* ── Agent load + late conversations ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="حمل الموظفين" hint="مين شايل كام محادثة دلوقتي">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  {["الموظف", "مفتوحة", "تحتاج رد", "متوسط الرد"].map((h, i) => (
                    <th
                      key={h}
                      className={`border-b border-border bg-surface-2 px-5 py-3 text-2xs font-bold uppercase tracking-wide text-muted-foreground ${i === 0 ? "text-start" : "text-end"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.agentLoad.map((a) => (
                  <tr key={a.agentId ?? a.name} className="transition-colors hover:bg-primary/[0.035]">
                    <td className="border-b border-border/70 px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={a.name} />
                        {a.agentId ? (
                          <Link href={`/agents/${a.agentId}`} className="font-semibold text-foreground hover:text-primary hover:underline">
                            {a.name}
                          </Link>
                        ) : (
                          <span className="font-semibold">{a.name}</span>
                        )}
                      </div>
                    </td>
                    <td className="border-b border-border/70 px-5 py-3 text-end tnum font-semibold">{formatNumber(a.open)}</td>
                    <td className="border-b border-border/70 px-5 py-3 text-end tnum font-semibold text-warning-fg">
                      {formatNumber(a.needsReply)}
                    </td>
                    <td className="border-b border-border/70 px-5 py-3 text-end tnum text-muted-foreground">
                      {formatDurationShort(a.avgResponseSeconds)}
                    </td>
                  </tr>
                ))}
                {!data.agentLoad.length && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState title="لا يوجد موظفون في الفترة دي" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          title="محادثات متأخرة"
          hint="أطول محادثات مستنية رد"
          action={<ExportButton dataset="conversations" />}
        >
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  {["العميل", "القسم", "الموظف", "الانتظار"].map((h, i) => (
                    <th
                      key={h}
                      className={`border-b border-border bg-surface-2 px-5 py-3 text-2xs font-bold uppercase tracking-wide text-muted-foreground ${i === 3 ? "text-end" : "text-start"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.lateConversations.map((c) => (
                  <tr key={c.chatwootId} className="transition-colors hover:bg-primary/[0.035]">
                    <td className="border-b border-border/70 px-5 py-3.5">
                      <Link
                        href={`/conversations?conv=${c.chatwootId}`}
                        className="font-semibold text-foreground hover:text-primary hover:underline"
                      >
                        {c.contactName || `#${c.chatwootId}`}
                      </Link>
                    </td>
                    <td className="border-b border-border/70 px-5 py-3.5">
                      <DepartmentPill department={c.department} />
                    </td>
                    <td className="border-b border-border/70 px-5 py-3.5 text-muted-foreground">{c.assigneeName || "—"}</td>
                    <td className="border-b border-border/70 px-5 py-3.5 text-end tnum font-bold text-destructive-fg">
                      {formatDurationShort(c.waitingSeconds)}
                    </td>
                  </tr>
                ))}
                {!data.lateConversations.length && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState title="مفيش محادثات متأخرة" hint="كله تحت السيطرة 👌" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {/* ── Campaign performance ── */}
      <Card>
        <CardTitle hint="من تطبيقَي رفع الكامبينات — المبيعات والعمليات">أداء الكامبينات</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          {data.campaignPerformance.map((c) => (
            <div key={c.source} className="rounded-card border border-border p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Megaphone className="h-4 w-4" />
                </span>
                <span className="text-sm font-bold">
                  {CAMPAIGN_SOURCE_LABELS_AR[c.source as CampaignSource] ?? c.source}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="مُرسل" value={formatNumber(c.sent)} />
                <MiniStat label="ردود" value={formatNumber(c.replies)} tone="success" />
                <MiniStat label="نسبة الرد" value={formatPercent(c.replyRate, 1)} tone="brand" />
              </div>
            </div>
          ))}
          {!data.campaignPerformance.length && <EmptyState title="لا توجد كامبينات" />}
        </div>
      </Card>
    </div>
  );
}
