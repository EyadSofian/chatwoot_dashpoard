"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Megaphone, MessageSquareReply, Timer } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { CampaignsResult, CampaignRow } from "@/lib/reporting/campaigns";
import { Section, LoadingBlock, ErrorState, Badge, cn, StatTile, StatStrip, SkeletonCards, Meter } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { CampaignDrawer } from "@/components/CampaignDrawer";
import { formatDateTime, formatDurationShort, formatNumber, formatPercent } from "@/lib/format";
import { useLocale } from "@/lib/i18n";

const TABS = [
  { key: "all", labels: ["الكل", "All"] },
  { key: "sales", labels: ["المبيعات", "Sales"] },
  { key: "operations", labels: ["العمليات", "Operations"] },
] as const;

const BUCKET_TONE: Record<string, "success" | "primary" | "warning" | "danger" | "muted"> = {
  completed: "success",
  running: "primary",
  pending: "warning",
  failed: "danger",
  stopped: "muted",
};

/** A campaign with nothing to report is not the same as one with zero replies. */
function StateNote({ row }: { row: CampaignRow }) {
  const { tr } = useLocale();
  if (row.dataState === "not_reconciled") {
    return (
      <span className="text-2xs font-semibold text-warning-fg">
        {tr("تمت مزامنة الإرسال، ولم تُطابَق برسائل Chatwoot بعد", "Sends synced, not yet matched to Chatwoot messages")}
      </span>
    );
  }
  if (row.dataState === "no_replies") {
    return <span className="text-2xs text-muted-foreground">{tr("لا توجد ردود من العملاء", "No customer replies")}</span>;
  }
  return null;
}

export default function CampaignsPage() {
  const { tr, locale } = useLocale();
  const { data, loading, error } = useApiData<CampaignsResult>("/api/campaigns");
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [selected, setSelected] = useState<{ source: string; jobId: string } | null>(null);

  const rows = (data?.rows ?? []).filter((r) => tab === "all" || r.sourceKey === tab);
  const t = data?.totals;

  const num = (v: number) => <span className="tnum">{formatNumber(v)}</span>;

  const columns: Column<CampaignRow>[] = [
    {
      key: "label",
      header: tr("الكامبين", "Campaign"),
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{r.label || "—"}</div>
          <div className="truncate text-2xs text-muted-foreground">{r.template || "—"}</div>
          <StateNote row={r} />
        </div>
      ),
    },
    {
      key: "operatorName",
      header: tr("منشئ الكامبين", "Created by"),
      render: (r) => <span className="font-semibold text-primary">{r.operatorName || "—"}</span>,
    },
    {
      // Straight from the job — never a reply-team marker that may not exist.
      key: "sourceKey",
      header: tr("المصدر", "Source"),
      render: (r) => (
        <Badge tone={r.sourceKey === "sales" ? "primary" : "violet"}>
          {r.sourceKey === "sales" ? tr("مبيعات", "Sales") : tr("عمليات", "Operations")}
        </Badge>
      ),
    },
    {
      key: "status",
      header: tr("الحالة", "Status"),
      render: (r) => <Badge tone={BUCKET_TONE[r.statusBucket ?? "muted"] ?? "muted"}>{r.status || "—"}</Badge>,
    },
    {
      key: "sent",
      header: tr("تم الإرسال", "Sent"),
      align: "end",
      render: (r) => <span className="tnum font-semibold">{formatNumber(r.sent)}</span>,
    },
    {
      key: "failed",
      header: tr("فشل الإرسال", "Failed"),
      align: "end",
      render: (r) => (
        <span className={cn("tnum", r.failed > 0 && "font-bold text-destructive-fg")}>{formatNumber(r.failed)}</span>
      ),
    },
    {
      key: "customerReplies",
      header: tr("رد العملاء", "Customer replies"),
      align: "end",
      render: (r) => <span className="tnum font-bold text-success-fg">{formatNumber(r.customerReplies)}</span>,
    },
    {
      key: "replyRate",
      header: tr("نسبة رد العملاء", "Customer reply rate"),
      align: "end",
      // 0.0%, never "—" — a zero rate is a real answer, not missing data.
      render: (r) => (
        <div className="min-w-[86px]">
          <span className="tnum font-semibold text-primary">{formatPercent(r.replyRate, 1)}</span>
          <Meter value={r.replyRate} className="mt-1" />
        </div>
      ),
    },
    { key: "teamReplied", header: tr("رد عليهم الفريق", "Team replied"), align: "end", render: (r) => num(r.teamReplied) },
    {
      key: "avgTeamResponseSeconds",
      header: tr("متوسط رد الفريق", "Avg team response"),
      align: "end",
      render: (r) =>
        r.avgTeamResponseSeconds === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tnum">{formatDurationShort(r.avgTeamResponseSeconds)}</span>
        ),
    },
    { key: "unassigned", header: tr("غير مسندين", "Unassigned"), align: "end", render: (r) => num(r.unassigned) },
  ];

  return (
    <div className="space-y-5">
      {loading && !data ? (
        <SkeletonCards count={5} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatTile
            label={tr("تم الإرسال", "Sent")}
            value={formatNumber(t?.sent ?? 0)}
            icon={<Megaphone className="h-[18px] w-[18px]" />}
            tone="brand"
          />
          <StatTile
            label={tr("رد العملاء", "Customer replies")}
            value={formatNumber(t?.customerReplies ?? 0)}
            icon={<MessageSquareReply className="h-[18px] w-[18px]" />}
            tone="success"
            sub={tr("من المستلمين", "of recipients")}
          />
          <StatTile
            label={tr("نسبة رد العملاء", "Customer reply rate")}
            value={formatPercent(t?.replyRate ?? 0, 1)}
            icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
            tone="violet"
          />
          <StatTile
            label={tr("رد عليهم الفريق", "Team replied")}
            value={formatNumber(t?.teamReplied ?? 0)}
            icon={<Timer className="h-[18px] w-[18px]" />}
            tone="brand"
          />
          <StatTile
            label={tr("ردود وصلت خلال الفترة", "Replies received in period")}
            value={formatNumber(t?.repliesInPeriod ?? 0)}
            icon={<MessageSquareReply className="h-[18px] w-[18px]" />}
            tone="neutral"
            sub={tr("بغض النظر عن تاريخ الإرسال", "regardless of send date")}
          />
        </div>
      )}

      {data && !data.meta.synced && (
        <div className="flex items-center gap-3 rounded-card border border-warning/30 bg-warning/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning-fg" aria-hidden />
          <p className="text-sm font-semibold text-warning-fg">
            {tr("تطبيق الكامبينات غير متزامن — شغِّل Campaign Sync من الإعدادات.", "Campaign app not synced — run Campaign Sync from Settings.")}
          </p>
        </div>
      )}

      {data && t && t.unmatched > 0 && (
        <div className="flex items-center gap-3 rounded-card border border-border bg-muted px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-xs text-muted-foreground">
            {formatNumber(t.unmatched)} {tr("مستلمون غير مرتبطين برسالة Chatwoot — مستبعدون من القياس.", "recipients could not be matched to a Chatwoot message — excluded from the metric.")}
          </p>
        </div>
      )}

      <Section
        title={tr("أداء الكامبينات", "Campaign performance")}
        hint={tr("نسبة الرد من عدد المستلمين الفعلي", "Reply rate is out of actual recipients")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full border border-border bg-background p-1">
              {TABS.map((tb) => (
                <button
                  key={tb.key}
                  onClick={() => setTab(tb.key)}
                  className={cn(
                    "cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                    tab === tb.key
                      ? "bg-primary text-on-primary shadow-brand"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {locale === "ar" ? tb.labels[0] : tb.labels[1]}
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
          <div className="p-4">
            <ErrorState message={error} />
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <DataTable
                columns={columns}
                rows={rows}
                getKey={(r) => `${r.sourceKey}:${r.jobId}`}
                onRowClick={(r) => setSelected({ source: r.sourceKey, jobId: r.jobId })}
                emptyTitle={tr("لا توجد كامبينات — شغِّل Campaign Sync من الإعدادات", "No campaigns — run Campaign Sync from Settings")}
              />
            </div>

            {/* Mobile: cards, never a table you have to drag sideways. */}
            <ul className="space-y-3 p-4 lg:hidden">
              {rows.map((r) => (
                <li key={`${r.sourceKey}:${r.jobId}`}>
                  <button
                    onClick={() => setSelected({ source: r.sourceKey, jobId: r.jobId })}
                    className="w-full cursor-pointer rounded-card border border-border bg-surface p-4 text-start transition-shadow hover:shadow-card-hover"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-bold">{r.label || "—"}</div>
                        <div className="truncate text-2xs text-muted-foreground">{r.operatorName || "—"}</div>
                      </div>
                      <Badge tone={r.sourceKey === "sales" ? "primary" : "violet"}>
                        {r.sourceKey === "sales" ? tr("مبيعات", "Sales") : tr("عمليات", "Operations")}
                      </Badge>
                    </div>

                    <StatStrip
                      className="mt-3"
                      items={[
                        { label: tr("أُرسل", "Sent"), value: formatNumber(r.sent) },
                        { label: tr("رد العملاء", "Replies"), value: formatNumber(r.customerReplies), tone: "success" },
                        { label: tr("نسبة الرد", "Rate"), value: formatPercent(r.replyRate, 1), tone: "brand" },
                        { label: tr("رد الفريق", "Team"), value: formatNumber(r.teamReplied) },
                      ]}
                    />
                    <Meter value={r.replyRate} className="mt-2" />

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StateNote row={r} />
                      {r.createdAt && <span className="text-2xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>}
                    </div>
                  </button>
                </li>
              ))}
              {!rows.length && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  {tr("لا توجد كامبينات — شغِّل Campaign Sync من الإعدادات", "No campaigns — run Campaign Sync from Settings")}
                </li>
              )}
            </ul>
          </>
        )}
      </Section>

      {data && (
        <p className="text-2xs text-muted-foreground">
          {tr("آخر Sync كامبينات", "Last campaign sync")}: {data.meta.lastCampaignSyncAt ? formatDateTime(data.meta.lastCampaignSyncAt) : "—"} · {tr("آخر مطابقة", "Last reconciliation")}: {data.meta.lastReconciledAt ? formatDateTime(data.meta.lastReconciledAt) : "—"}
        </p>
      )}

      {selected && <CampaignDrawer source={selected.source} jobId={selected.jobId} onClose={() => setSelected(null)} />}
    </div>
  );
}
