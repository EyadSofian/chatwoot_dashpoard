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
import { useLocale, campaignSourceLabel, departmentLabel } from "@/lib/i18n";

export default function OverviewPage() {
  const { tr, locale } = useLocale();
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
        title={tr("لا توجد بيانات", "No data yet")}
        hint={tr("ابدأ من الإعدادات: Backfill أو Webhook.", "Start from Settings: Backfill or Webhook.")}
      />
    );
  }

  const k = data.kpis;
  const deptChart = data.responseByDepartment
    .filter((d) => d.avgResponseSeconds !== null)
    .map((d) => ({
      department: departmentLabel(d.department, locale),
      avg: d.avgResponseSeconds ?? 0,
    }));

  return (
    <div className="space-y-5">
      {/* ── Headline KPIs — four, big, one glance ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={tr("إجمالي المحادثات", "Total conversations")}
          value={formatNumber(k.totalConversations)}
          icon={<MessageSquare className="h-[18px] w-[18px]" />}
          tone="brand"
          sub={`${formatNumber(k.openNow)} ${tr("مفتوحة الآن", "open now")}`}
        />
        <StatTile
          label={tr("متوسط زمن الرد", "Avg response time")}
          value={formatDurationShort(k.avgResponseSeconds)}
          icon={<Timer className="h-[18px] w-[18px]" />}
          tone="violet"
          sub={`${tr("الوسيط", "Median")} ${formatDurationShort(k.medianResponseSeconds)} · ${tr("من لحظة الإسناد", "from assignment")}`}
        />
        <StatTile
          label={tr("تحتاج رد", "Needs reply")}
          value={formatNumber(k.needsReply)}
          icon={<Reply className="h-[18px] w-[18px]" />}
          tone="warning"
          sub={tr("آخر رسالة من العميل", "Customer messaged last")}
        />
        <StatTile
          label={tr("خرق مستوى الخدمة", "SLA breaches")}
          value={formatNumber(k.slaBreaches)}
          icon={<AlertTriangle className="h-[18px] w-[18px]" />}
          tone="danger"
          sub={<Link href="/sla" className="font-semibold text-primary hover:underline">{tr("عرض التفاصيل ←", "View details →")}</Link>}
        />
      </div>

      {/* ── Secondary strip ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label={tr("متوسط زمن الحل", "Avg resolution time")}
          value={formatDurationShort(k.avgResolutionSeconds)}
          icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
          tone="success"
        />
        <StatTile
          label={tr("مفتوحة الآن", "Open now")}
          value={formatNumber(k.openNow)}
          icon={<Clock className="h-[18px] w-[18px]" />}
          tone="brand"
        />
        <StatTile
          label={tr("رسائل الكامبين", "Campaign sends")}
          value={formatNumber(k.campaignsSent)}
          icon={<Megaphone className="h-[18px] w-[18px]" />}
          tone="violet"
        />
        <StatTile
          label={tr("ردود الكامبين", "Campaign replies")}
          value={formatNumber(k.campaignReplies)}
          icon={<Users className="h-[18px] w-[18px]" />}
          tone="success"
        />
      </div>

      {/* ── Charts ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle hint={tr("جديدة مقابل محلولة", "New vs resolved")}>{tr("اتجاه المحادثات", "Conversation trend")}</CardTitle>
          {data.dailyTrend.length ? <TrendChart data={data.dailyTrend} /> : <EmptyState title={tr("لا توجد بيانات في الفترة", "No data in this period")} />}
        </Card>

        <Card>
          <CardTitle hint={tr("من الإسناد إلى أول رد", "From assignment to first reply")}>{tr("زمن الرد حسب القسم", "Response time by department")}</CardTitle>
          {deptChart.length ? <DeptResponseBar data={deptChart} /> : <EmptyState title={tr("لا توجد بيانات", "No data")} />}
        </Card>
      </div>

      {/* ── Agent load + late conversations ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={tr("حمل الموظفين", "Agent workload")} hint={tr("المفتوحة حاليًا", "Currently open")}>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  {[tr("الموظف","Agent"), tr("مفتوحة","Open"), tr("تحتاج رد","Needs reply"), tr("متوسط الرد","Avg response")].map((h, i) => (
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
                      <EmptyState title={tr("لا يوجد موظفون في الفترة", "No agents in this period")} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          title={tr("محادثات متأخرة", "Delayed conversations")}
          hint={tr("الأطول انتظارًا", "Longest waiting")}
          action={<ExportButton dataset="conversations" />}
        >
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  {[tr("العميل","Customer"), tr("القسم","Department"), tr("الموظف","Agent"), tr("الانتظار","Waiting")].map((h, i) => (
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
                      <EmptyState title={tr("لا توجد محادثات متأخرة", "No delayed conversations")}  />
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
        <CardTitle hint="Sales / Operations">{tr("أداء الكامبينات", "Campaign performance")}</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          {data.campaignPerformance.map((c) => (
            <div key={c.source} className="rounded-card border border-border p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Megaphone className="h-4 w-4" />
                </span>
                <span className="text-sm font-bold">{campaignSourceLabel(c.source, locale)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label={tr("مُرسل", "Sent")} value={formatNumber(c.sent)} />
                <MiniStat label={tr("ردود", "Replies")} value={formatNumber(c.replies)} tone="success" />
                <MiniStat label={tr("نسبة الرد", "Reply rate")} value={formatPercent(c.replyRate, 1)} tone="brand" />
              </div>
            </div>
          ))}
          {!data.campaignPerformance.length && <EmptyState title={tr("لا توجد كامبينات", "No campaigns")} />}
        </div>
      </Card>
    </div>
  );
}
