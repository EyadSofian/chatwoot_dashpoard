"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Megaphone, MessageSquareReply, Timer } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { CampaignsResult, CampaignRow } from "@/lib/reporting/campaigns";
import { Section, LoadingBlock, ErrorState, Badge, cn, StatTile, SkeletonCards } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { CampaignDrawer } from "@/components/CampaignDrawer";
import { formatDateTime, formatDurationShort, formatNumber, formatPercent } from "@/lib/format";

const TABS = [
  { key: "all", label: "الكل" },
  { key: "sales", label: "المبيعات" },
  { key: "operations", label: "العمليات" },
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
  if (row.dataState === "not_reconciled") {
    return (
      <span className="text-2xs font-semibold text-warning-fg">
        تمت مزامنة الإرسال لكن لم تتم مطابقة رسائل شات ووت بعد
      </span>
    );
  }
  if (row.dataState === "no_replies") {
    return <span className="text-2xs text-muted-foreground">لا توجد ردود من العملاء في هذه الحملة</span>;
  }
  return null;
}

export default function CampaignsPage() {
  const { data, loading, error } = useApiData<CampaignsResult>("/api/campaigns");
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [selected, setSelected] = useState<{ source: string; jobId: string } | null>(null);

  const rows = (data?.rows ?? []).filter((r) => tab === "all" || r.sourceKey === tab);
  const t = data?.totals;

  const num = (v: number) => <span className="tnum">{formatNumber(v)}</span>;

  const columns: Column<CampaignRow>[] = [
    {
      key: "label",
      header: "الكامبين",
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
      header: "مين عمل الكامبين",
      render: (r) => <span className="font-semibold text-primary">{r.operatorName || "—"}</span>,
    },
    {
      // Straight from the job — never a reply-team marker that may not exist.
      key: "sourceKey",
      header: "المصدر",
      render: (r) => (
        <Badge tone={r.sourceKey === "sales" ? "primary" : "violet"}>
          {r.sourceKey === "sales" ? "مبيعات" : "عمليات"}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => <Badge tone={BUCKET_TONE[r.statusBucket ?? "muted"] ?? "muted"}>{r.status || "—"}</Badge>,
    },
    {
      key: "sent",
      header: "تم الإرسال",
      align: "end",
      render: (r) => <span className="tnum font-semibold">{formatNumber(r.sent)}</span>,
    },
    {
      key: "failed",
      header: "فشل الإرسال",
      align: "end",
      render: (r) => (
        <span className={cn("tnum", r.failed > 0 && "font-bold text-destructive-fg")}>{formatNumber(r.failed)}</span>
      ),
    },
    {
      key: "customerReplies",
      header: "رد العملاء",
      align: "end",
      render: (r) => <span className="tnum font-bold text-success-fg">{formatNumber(r.customerReplies)}</span>,
    },
    {
      key: "replyRate",
      header: "نسبة رد العملاء",
      align: "end",
      // 0.0%, never "—" — a zero rate is a real answer, not missing data.
      render: (r) => <span className="tnum font-semibold text-primary">{formatPercent(r.replyRate, 1)}</span>,
    },
    { key: "teamReplied", header: "رد عليهم الفريق", align: "end", render: (r) => num(r.teamReplied) },
    {
      key: "avgTeamResponseSeconds",
      header: "متوسط رد الفريق",
      align: "end",
      render: (r) =>
        r.avgTeamResponseSeconds === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tnum">{formatDurationShort(r.avgTeamResponseSeconds)}</span>
        ),
    },
    { key: "unassigned", header: "غير مسندين", align: "end", render: (r) => num(r.unassigned) },
  ];

  return (
    <div className="space-y-5">
      {loading && !data ? (
        <SkeletonCards count={5} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatTile
            label="تم الإرسال"
            value={formatNumber(t?.sent ?? 0)}
            icon={<Megaphone className="h-[18px] w-[18px]" />}
            tone="brand"
          />
          <StatTile
            label="رد العملاء"
            value={formatNumber(t?.customerReplies ?? 0)}
            icon={<MessageSquareReply className="h-[18px] w-[18px]" />}
            tone="success"
            sub="من المستلمين الذين أُرسل لهم الكامبين"
          />
          <StatTile
            label="نسبة رد العملاء"
            value={formatPercent(t?.replyRate ?? 0, 1)}
            icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
            tone="violet"
          />
          <StatTile
            label="رد عليهم الفريق"
            value={formatNumber(t?.teamReplied ?? 0)}
            icon={<Timer className="h-[18px] w-[18px]" />}
            tone="brand"
          />
          <StatTile
            label="ردود وصلت خلال الفترة"
            value={formatNumber(t?.repliesInPeriod ?? 0)}
            icon={<MessageSquareReply className="h-[18px] w-[18px]" />}
            tone="neutral"
            sub="حجم يومي — مستقل عن أداء كامبينات الفترة"
          />
        </div>
      )}

      {data && !data.meta.synced && (
        <div className="flex items-center gap-3 rounded-card border border-warning/30 bg-warning/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning-fg" aria-hidden />
          <p className="text-sm font-semibold text-warning-fg">
            لم تتم مزامنة تطبيق الكامبين — نفّذ «مزامنة الكامبينات» من الإعدادات.
          </p>
        </div>
      )}

      {data && t && t.unmatched > 0 && (
        <div className="flex items-center gap-3 rounded-card border border-border bg-muted px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-xs text-muted-foreground">
            {formatNumber(t.unmatched)} مستلم لم يمكن ربطه برسالة شات ووت — مستبعدون من القياس الدقيق.
          </p>
        </div>
      )}

      <Section
        title="أداء الكامبينات"
        hint="نسبة الرد محسوبة من المستلمين الذين أُرسل لهم هذا الكامبين"
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
                  {tb.label}
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
                emptyTitle="لا توجد كامبينات — نفّذ مزامنة الكامبينات من الإعدادات"
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
                        {r.sourceKey === "sales" ? "مبيعات" : "عمليات"}
                      </Badge>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-surface-2 p-2.5 text-center">
                        <div className="text-base font-bold tnum">{formatNumber(r.sent)}</div>
                        <div className="text-2xs text-muted-foreground">تم الإرسال</div>
                      </div>
                      <div className="rounded-xl bg-surface-2 p-2.5 text-center">
                        <div className="text-base font-bold tnum text-success-fg">{formatNumber(r.customerReplies)}</div>
                        <div className="text-2xs text-muted-foreground">رد العملاء</div>
                      </div>
                      <div className="rounded-xl bg-surface-2 p-2.5 text-center">
                        <div className="text-base font-bold tnum text-primary">{formatPercent(r.replyRate, 1)}</div>
                        <div className="text-2xs text-muted-foreground">نسبة الرد</div>
                      </div>
                      <div className="rounded-xl bg-surface-2 p-2.5 text-center">
                        <div className="text-base font-bold tnum">{formatNumber(r.teamReplied)}</div>
                        <div className="text-2xs text-muted-foreground">رد الفريق</div>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StateNote row={r} />
                      {r.createdAt && <span className="text-2xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>}
                    </div>
                  </button>
                </li>
              ))}
              {!rows.length && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  لا توجد كامبينات — نفّذ مزامنة الكامبينات من الإعدادات
                </li>
              )}
            </ul>
          </>
        )}
      </Section>

      {data && (
        <p className="text-2xs text-muted-foreground">
          آخر مزامنة كامبينات: {data.meta.lastCampaignSyncAt ? formatDateTime(data.meta.lastCampaignSyncAt) : "—"} · آخر
          مطابقة: {data.meta.lastReconciledAt ? formatDateTime(data.meta.lastReconciledAt) : "—"}
        </p>
      )}

      {selected && <CampaignDrawer source={selected.source} jobId={selected.jobId} onClose={() => setSelected(null)} />}
    </div>
  );
}
