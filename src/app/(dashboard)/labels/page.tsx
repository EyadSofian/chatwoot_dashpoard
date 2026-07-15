"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, MessagesSquare, Reply, Tags, Timer } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { LabelRow, LabelsResult } from "@/lib/reporting/labels";
import {
  Badge,
  Card,
  CardTitle,
  cn,
  ErrorState,
  LoadingBlock,
  Meter,
  Section,
  SkeletonCards,
  StatStrip,
  StatTile,
} from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { CompareBar } from "@/components/charts";
import { ExportButton } from "@/components/ExportButton";
import { formatDateTime, formatDurationShort, formatNumber, formatPercent } from "@/lib/format";
import { useLocale } from "@/lib/i18n";

const dash = <span className="text-muted-foreground">—</span>;

/** Chatwoot stores a label's colour; use it so the report looks like the inbox. */
function LabelChip({ title, color }: { title: string; color: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
        style={{ background: color || "transparent" }}
        aria-hidden
      />
      <span className="truncate font-semibold">{title}</span>
    </span>
  );
}

type Metric = "conversations" | "avgResponseSeconds" | "slaBreaches";

export default function LabelsPage() {
  const { tr } = useLocale();
  const METRICS: { key: Metric; label: string; unit: string }[] = [
    { key: "conversations", label: tr("المحادثات", "Conversations"), unit: "" },
    { key: "avgResponseSeconds", label: tr("متوسط الرد", "Avg response"), unit: tr(" ث", " s") },
    { key: "slaBreaches", label: tr("خرق SLA", "SLA breaches"), unit: "" },
  ];
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [metric, setMetric] = useState<Metric>("conversations");

  const activeOnly = searchParams.get("activeOnly") === "true";
  const { data, loading, error } = useApiData<LabelsResult>("/api/labels");

  const toggleActiveOnly = (on: boolean) => {
    const next = new URLSearchParams(searchParams.toString());
    if (on) next.set("activeOnly", "true");
    else next.delete("activeOnly");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const s = data?.summary;
  const rows = data?.rows ?? [];

  // Compare whatever is selected in the global filter; otherwise the busiest ten.
  const selected = (searchParams.get("label") ?? "").split(",").filter(Boolean);
  const compareRows = (selected.length ? rows.filter((r) => selected.includes(r.title)) : rows)
    .filter((r) => r.hasActivity)
    .slice(0, 10);

  const compareData = compareRows.map((r) => ({
    name: r.title,
    value: metric === "avgResponseSeconds" ? Math.round(r.avgResponseSeconds ?? 0) : (r[metric] as number),
    color: r.color || undefined,
  }));

  const num = (v: number) => <span className="tnum">{formatNumber(v)}</span>;
  const dur = (v: number | null) => (v === null ? dash : <span className="tnum">{formatDurationShort(v)}</span>);

  const columns: Column<LabelRow>[] = [
    {
      key: "title",
      header: "Label",
      render: (r) => (
        <div className="min-w-0">
          <LabelChip title={r.title} color={r.color} />
          {!r.hasActivity && <div className="text-2xs text-muted-foreground">{tr("لا يوجد نشاط في الفترة", "No activity in the period")}</div>}
        </div>
      ),
    },
    { key: "conversations", header: tr("محادثات", "Conversations"), align: "end", render: (r) => num(r.conversations) },
    {
      key: "share",
      header: tr("النسبة", "Share"),
      align: "end",
      render: (r) => (
        <div className="min-w-[80px]">
          <span className="tnum font-semibold text-primary">{formatPercent(r.share, 1)}</span>
          <Meter value={r.share} className="mt-1" />
        </div>
      ),
    },
    { key: "open", header: tr("مفتوحة", "Open"), align: "end", render: (r) => num(r.open) },
    { key: "resolved", header: tr("محلولة", "Resolved"), align: "end", render: (r) => num(r.resolved) },
    {
      key: "needsReply",
      header: tr("تحتاج رد", "Needs reply"),
      align: "end",
      render: (r) => (
        <span className={cn("tnum", r.needsReply > 0 && "font-bold text-destructive-fg")}>
          {formatNumber(r.needsReply)}
        </span>
      ),
    },
    { key: "avgResponseSeconds", header: tr("متوسط الرد", "Avg response"), align: "end", render: (r) => dur(r.avgResponseSeconds) },
    { key: "avgResolutionSeconds", header: tr("متوسط الإغلاق", "Avg resolution"), align: "end", render: (r) => dur(r.avgResolutionSeconds) },
    {
      key: "slaBreaches",
      header: tr("خرق SLA", "SLA breaches"),
      align: "end",
      render: (r) =>
        r.slaBreaches ? <Badge tone="danger">{formatNumber(r.slaBreaches)}</Badge> : r.hasActivity ? num(0) : dash,
    },
    {
      key: "lastActivityAt",
      header: tr("آخر نشاط", "Last activity"),
      align: "end",
      render: (r) =>
        r.lastActivityAt ? (
          <span className="text-xs text-muted-foreground">{formatDateTime(r.lastActivityAt)}</span>
        ) : (
          dash
        ),
    },
  ];

  return (
    <div className="space-y-5">
      {loading && !data ? (
        <SkeletonCards count={5} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatTile
            label={tr("إجمالي الـ Labels", "Total labels")}
            value={formatNumber(s?.totalLabels ?? 0)}
            icon={<Tags className="h-[18px] w-[18px]" />}
            tone="brand"
          />
          <StatTile
            label={tr("Labels نشطة", "Active labels")}
            value={formatNumber(s?.activeLabels ?? 0)}
            icon={<Tags className="h-[18px] w-[18px]" />}
            tone="success"
          />
          <StatTile
            label={tr("إجمالي المحادثات", "Total conversations")}
            value={formatNumber(s?.conversations ?? 0)}
            icon={<MessagesSquare className="h-[18px] w-[18px]" />}
            tone="violet"
            sub={tr("محادثة بعدة Labels تُحسب مرة واحدة هنا", "A conversation with several labels is counted once here")}
          />
          <StatTile
            label={tr("بدون Label", "Unlabeled")}
            value={formatNumber(s?.unlabeled ?? 0)}
            icon={<Reply className="h-[18px] w-[18px]" />}
            tone="warning"
          />
          <StatTile
            label={tr("متوسط الرد العام", "Overall avg response")}
            value={s?.avgResponseSeconds != null ? formatDurationShort(s.avgResponseSeconds) : "—"}
            icon={<Timer className="h-[18px] w-[18px]" />}
            tone="neutral"
          />
        </div>
      )}

      {/* Comparison */}
      <Card>
        <CardTitle
          hint={
            selected.length
              ? `${tr("مقارنة", "Comparing")} ${formatNumber(selected.length)} ${tr("Labels مختارة", "selected labels")}`
              : tr("أعلى ١٠ Labels — اختر Labels من الفلاتر للمقارنة بينها", "Top 10 labels — pick labels from the filters to compare")
          }
          action={
            <div className="flex rounded-full border border-border bg-background p-1">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className={cn(
                    "cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                    metric === m.key
                      ? "bg-primary text-on-primary shadow-brand"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          }
        >
          {tr("مقارنة الـ Labels", "Label comparison")}
        </CardTitle>

        {loading ? (
          <LoadingBlock />
        ) : compareData.length ? (
          <CompareBar data={compareData} unit={METRICS.find((m) => m.key === metric)!.unit} />
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">{tr("لا يوجد نشاط لعرضه في الفترة المختارة", "No activity to show in the selected period")}</p>
        )}
      </Card>

      {/* A conversation can hold several labels, so the rows sum to more than the
          conversation total. Say so rather than let it look like a bug. */}
      <div className="flex items-start gap-3 rounded-card border border-border bg-muted px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-xs text-muted-foreground">
          {tr("المحادثة الواحدة قد تحمل أكثر من Label، لذا يُحتسب مجموع الصفوف أكثر من إجمالي المحادثات.", "One conversation can carry several labels, so the rows sum to more than the conversation total.")}
        </p>
      </div>

      <Section
        title={tr("أداء كل الـ Labels", "All labels performance")}
        hint={tr("الفترة تحدد الأرقام، لا قائمة الـ Labels", "The period changes the numbers, not which labels appear")}
        action={
          <div className="flex items-center gap-3">
            <label
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                activeOnly
                  ? "border-primary/30 bg-primary/5 text-primary"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 cursor-pointer accent-current"
                checked={activeOnly}
                onChange={(e) => toggleActiveOnly(e.target.checked)}
              />
              {tr("النشطة فقط", "Active only")}
            </label>
            <ExportButton dataset="labels" />
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
                getKey={(r) => r.title}
                emptyTitle={
                  activeOnly
                    ? tr("لا توجد Labels نشطة في الفترة المختارة", "No active labels in the selected period")
                    : tr("لا توجد Labels — شغِّل Sync من الإعدادات", "No labels — run a sync from Settings")
                }
              />
            </div>

            <ul className="space-y-3 p-4 lg:hidden">
              {rows.map((r) => (
                <li key={r.title} className="rounded-card border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <LabelChip title={r.title} color={r.color} />
                    {r.needsReply > 0 && <Badge tone="danger">{formatNumber(r.needsReply)} {tr("تحتاج رد", "need reply")}</Badge>}
                  </div>

                  {!r.hasActivity ? (
                    <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                      {tr("لا يوجد نشاط في الفترة المختارة", "No activity in the selected period")}
                    </p>
                  ) : (
                    <>
                      <StatStrip
                        className="mt-3"
                        items={[
                          { label: tr("محادثات", "Conversations"), value: formatNumber(r.conversations) },
                          { label: tr("مفتوحة", "Open"), value: formatNumber(r.open) },
                          {
                            label: tr("متوسط الرد", "Avg response"),
                            value: r.avgResponseSeconds != null ? formatDurationShort(r.avgResponseSeconds) : "—",
                            tone: "brand",
                          },
                          {
                            label: tr("خرق SLA", "SLA"),
                            value: formatNumber(r.slaBreaches),
                            tone: r.slaBreaches > 0 ? "danger" : "neutral",
                          },
                        ]}
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <Meter value={r.share} className="flex-1" />
                        <span className="shrink-0 text-2xs font-semibold tnum text-primary">
                          {formatPercent(r.share, 1)}
                        </span>
                      </div>
                    </>
                  )}
                </li>
              ))}
              {!rows.length && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  {activeOnly
                    ? tr("لا توجد Labels نشطة في الفترة المختارة", "No active labels in the selected period")
                    : tr("لا توجد Labels — شغِّل Sync من الإعدادات", "No labels — run a sync from Settings")}
                </li>
              )}
            </ul>
          </>
        )}
      </Section>
    </div>
  );
}
