"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AlertTriangle, Inbox, Reply, Timer, UserCheck, Users } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { AgentRow, AgentSummary } from "@/lib/reporting/agents";
import {
  Avatar,
  Badge,
  cn,
  ErrorState,
  LoadingBlock,
  Section,
  SkeletonCards,
  StatStrip,
  StatTile,
} from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { formatDurationShort, formatNumber } from "@/lib/format";

const dash = <span className="text-muted-foreground">—</span>;

export default function AgentsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeOnly = searchParams.get("activeOnly") === "true";
  const { data, loading, error } = useApiData<{ rows: AgentRow[]; summary: AgentSummary }>("/api/agents");

  const toggleActiveOnly = (on: boolean) => {
    const next = new URLSearchParams(searchParams.toString());
    if (on) next.set("activeOnly", "true");
    else next.delete("activeOnly");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const num = (v: number) => <span className="tnum">{formatNumber(v)}</span>;
  const dur = (v: number | null) => (v === null ? dash : <span className="tnum">{formatDurationShort(v)}</span>);

  const columns: Column<AgentRow>[] = [
    {
      key: "name",
      header: "الموظف",
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.name} />
          <div className="min-w-0">
            <div className={cn("truncate font-semibold", r.hasActivity ? "text-foreground" : "text-muted-foreground")}>
              {r.name}
            </div>
            {!r.hasActivity && <div className="text-2xs text-muted-foreground">لا يوجد نشاط</div>}
          </div>
        </div>
      ),
    },
    // ── Live state. Deliberately first: it is what Chatwoot shows. ──
    {
      key: "currentWorkload",
      header: "الحمل الحالي",
      align: "end",
      render: (r) => (
        <div className="tnum">
          <span className="font-bold">{formatNumber(r.currentWorkload)}</span>
          <div className="text-2xs text-muted-foreground">
            {r.currentOpen}/{r.currentPending}/{r.currentSnoozed}
          </div>
        </div>
      ),
    },
    {
      key: "needsReplyNow",
      header: "تحتاج رد الآن",
      align: "end",
      render: (r) => (
        <span className={cn("tnum", r.needsReplyNow > 0 && "font-bold text-destructive-fg")}>
          {formatNumber(r.needsReplyNow)}
        </span>
      ),
    },
    // ── Period activity. Named so it can never be read as live state. ──
    { key: "assignedInPeriod", header: "أُسندت في الفترة", align: "end", render: (r) => num(r.assignedInPeriod) },
    { key: "assignmentEvents", header: "أحداث الإسناد", align: "end", render: (r) => num(r.assignmentEvents) },
    { key: "createdInPeriod", header: "أُنشئت في الفترة", align: "end", render: (r) => num(r.createdInPeriod) },
    {
      key: "resolvedWhileAssigned",
      header: "أُغلقت في الفترة",
      align: "end",
      render: (r) => num(r.resolvedWhileAssigned),
    },
    { key: "avgResponseSeconds", header: "متوسط الرد", align: "end", render: (r) => dur(r.avgResponseSeconds) },
    { key: "medianResponseSeconds", header: "الوسيط", align: "end", render: (r) => dur(r.medianResponseSeconds) },
    { key: "p90ResponseSeconds", header: "p90", align: "end", render: (r) => dur(r.p90ResponseSeconds) },
    { key: "maxResponseSeconds", header: "الأقصى", align: "end", render: (r) => dur(r.maxResponseSeconds) },
    {
      key: "slaBreaches",
      header: "خرق SLA",
      align: "end",
      render: (r) =>
        r.slaBreaches ? <Badge tone="danger">{formatNumber(r.slaBreaches)}</Badge> : r.hasActivity ? num(0) : dash,
    },
  ];

  const s = data?.summary;

  return (
    <div className="space-y-5">
      {loading && !data ? (
        <SkeletonCards count={5} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatTile
            label="الحمل الحالي"
            value={formatNumber(s?.currentWorkload ?? 0)}
            icon={<Inbox className="h-[18px] w-[18px]" />}
            tone="brand"
            sub="الحالة الآن — لا تتأثر بالفترة"
          />
          <StatTile
            label="تحتاج رد الآن"
            value={formatNumber(s?.needsReplyNow ?? 0)}
            icon={<Reply className="h-[18px] w-[18px]" />}
            tone="warning"
            sub="الحالة الآن"
          />
          <StatTile
            label="أُسندت في الفترة"
            value={formatNumber(s?.assignedInPeriod ?? 0)}
            icon={<Users className="h-[18px] w-[18px]" />}
            tone="violet"
            sub="محادثات فريدة"
          />
          <StatTile
            label="متوسط الرد"
            value={s?.avgResponseSeconds != null ? formatDurationShort(s.avgResponseSeconds) : "—"}
            icon={<Timer className="h-[18px] w-[18px]" />}
            tone="neutral"
            sub={s?.p90ResponseSeconds != null ? `p90: ${formatDurationShort(s.p90ResponseSeconds)}` : undefined}
          />
          <StatTile
            label="خرق SLA"
            value={formatNumber(s?.slaBreaches ?? 0)}
            icon={<AlertTriangle className="h-[18px] w-[18px]" />}
            tone="danger"
          />
        </div>
      )}

      {/*
        The single most important sentence on this screen. The old report had ONE
        column called "Assigned" that mixed all three of these, which is how
        Chatwoot's 11 became the dashboard's 6.
      */}
      <div className="flex items-start gap-3 rounded-card border border-border bg-muted px-4 py-3">
        <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <strong className="text-foreground">الحمل الحالي</strong> هو الحالة الآن (open / pending / snoozed) ولا تؤثر
          عليه الفترة المختارة — وهو ما يطابق Chatwoot.{" "}
          <strong className="text-foreground">أُسندت في الفترة</strong> تعتمد على تاريخ الإسناد.{" "}
          <strong className="text-foreground">أُنشئت في الفترة</strong> تعتمد على تاريخ إنشاء المحادثة. ثلاثة أرقام
          مختلفة، ولا يصح دمجها في رقم واحد.
        </p>
      </div>

      <Section
        title="أداء كل الموظفين"
        hint="الفترة تحدد الأرقام، لا قائمة الموظفين"
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
              النشطون فقط
            </label>
            <ExportButton dataset="agents" />
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
                rows={data?.rows ?? []}
                getKey={(r) => r.agentId}
                onRowClick={(r) => router.push(`/agents/${r.agentId}`)}
                emptyTitle={
                  activeOnly
                    ? "لا يوجد موظفون نشطون في الفترة المختارة"
                    : "لا يوجد موظفون — شغِّل Sync من الإعدادات"
                }
              />
            </div>

            <ul className="space-y-3 p-4 lg:hidden">
              {(data?.rows ?? []).map((r) => (
                <li key={r.agentId}>
                  <button
                    onClick={() => router.push(`/agents/${r.agentId}`)}
                    className="w-full cursor-pointer rounded-card border border-border bg-surface p-4 text-start transition-shadow hover:shadow-card-hover"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.name} />
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            "truncate font-bold",
                            r.hasActivity ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {r.name}
                        </div>
                        {!r.hasActivity && <div className="text-2xs text-muted-foreground">لا يوجد نشاط</div>}
                      </div>
                      {r.needsReplyNow > 0 && <Badge tone="danger">{formatNumber(r.needsReplyNow)} تحتاج رد</Badge>}
                    </div>

                    <StatStrip
                      className="mt-3"
                      items={[
                        { label: "الحمل الحالي", value: formatNumber(r.currentWorkload), tone: "brand" },
                        { label: "أُسندت", value: formatNumber(r.assignedInPeriod) },
                        {
                          label: "متوسط الرد",
                          value: r.avgResponseSeconds != null ? formatDurationShort(r.avgResponseSeconds) : "—",
                        },
                        {
                          label: "خرق SLA",
                          value: formatNumber(r.slaBreaches),
                          tone: r.slaBreaches > 0 ? "danger" : "neutral",
                        },
                      ]}
                    />
                  </button>
                </li>
              ))}
              {!(data?.rows ?? []).length && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  {activeOnly ? "لا يوجد موظفون نشطون في الفترة المختارة" : "لا يوجد موظفون — شغِّل Sync من الإعدادات"}
                </li>
              )}
            </ul>
          </>
        )}
      </Section>
    </div>
  );
}
