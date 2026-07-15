"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Inbox, Reply, Timer, UserCheck, Users } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { AgentLeaderboard, AgentRow } from "@/lib/reporting/agents";
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
import { useLocale } from "@/lib/i18n";

const dash = <span className="text-muted-foreground">—</span>;

export default function AgentsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { tr } = useLocale();
  const activeOnly = searchParams.get("activeOnly") === "true";
  const { data, loading, error } = useApiData<AgentLeaderboard>("/api/agents");

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
      header: tr("الموظف", "Agent"),
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.name} />
          <div className="min-w-0">
            <div className={cn("truncate font-semibold", r.hasActivity ? "text-foreground" : "text-muted-foreground")}>
              {r.name}
            </div>
            {!r.hasActivity && <div className="text-2xs text-muted-foreground">{tr("لا يوجد نشاط", "No activity")}</div>}
          </div>
        </div>
      ),
    },
    // ── Live state. Deliberately first: it is what Chatwoot shows. ──
    {
      key: "currentWorkload",
      header: tr("الحمل الحالي", "Current"),
      align: "end",
      render: (r) => (
        <div className="tnum">
          <span className="font-bold">{formatNumber(r.currentWorkload)}</span>
          <div className="text-2xs text-muted-foreground">
            {formatNumber(r.currentOpen)} {tr("مفتوحة", "open")} · {formatNumber(r.currentWaiting)} {tr("منتظرة", "waiting")}
          </div>
        </div>
      ),
    },
    {
      key: "needsReplyNow",
      header: tr("تحتاج رد الآن", "Needs reply now"),
      align: "end",
      render: (r) => (
        <span className={cn("tnum", r.needsReplyNow > 0 && "font-bold text-destructive-fg")}>
          {formatNumber(r.needsReplyNow)}
        </span>
      ),
    },
    // ── Period activity. Named so it can never be read as live state. ──
    { key: "assignedInPeriod", header: tr("أُسندت في الفترة", "Assigned (period)"), align: "end", render: (r) => num(r.assignedInPeriod) },
    { key: "assignmentEvents", header: tr("أحداث الإسناد", "Assignment events"), align: "end", render: (r) => num(r.assignmentEvents) },
    { key: "createdInPeriod", header: tr("أُنشئت في الفترة", "Created (period)"), align: "end", render: (r) => num(r.createdInPeriod) },
    {
      key: "resolvedWhileAssigned",
      header: tr("أُغلقت في الفترة", "Resolved (period)"),
      align: "end",
      render: (r) => num(r.resolvedWhileAssigned),
    },
    { key: "avgResponseSeconds", header: tr("متوسط الرد", "Avg response"), align: "end", render: (r) => dur(r.avgResponseSeconds) },
    { key: "medianResponseSeconds", header: tr("الوسيط", "Median"), align: "end", render: (r) => dur(r.medianResponseSeconds) },
    { key: "p90ResponseSeconds", header: "p90", align: "end", render: (r) => dur(r.p90ResponseSeconds) },
    { key: "maxResponseSeconds", header: tr("الأقصى", "Max"), align: "end", render: (r) => dur(r.maxResponseSeconds) },
    {
      key: "slaBreaches",
      header: tr("خرق SLA", "SLA breaches"),
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
            label={tr("الحمل الحالي", "Current workload")}
            value={formatNumber(s?.currentWorkload ?? 0)}
            icon={<Inbox className="h-[18px] w-[18px]" />}
            tone="brand"
            sub={tr("الحالة الآن — لا تتأثر بالفترة", "Live state — ignores the period")}
          />
          <StatTile
            label={tr("تحتاج رد الآن", "Needs reply now")}
            value={formatNumber(s?.needsReplyNow ?? 0)}
            icon={<Reply className="h-[18px] w-[18px]" />}
            tone="warning"
            sub={tr("الحالة الآن", "Live state")}
          />
          <StatTile
            label={tr("أُسندت في الفترة", "Assigned in period")}
            value={formatNumber(s?.assignedInPeriod ?? 0)}
            icon={<Users className="h-[18px] w-[18px]" />}
            tone="violet"
            sub={tr("محادثات فريدة", "Unique conversations")}
          />
          <StatTile
            label={tr("متوسط الرد", "Avg response")}
            value={s?.avgResponseSeconds != null ? formatDurationShort(s.avgResponseSeconds) : "—"}
            icon={<Timer className="h-[18px] w-[18px]" />}
            tone="neutral"
            sub={s?.p90ResponseSeconds != null ? `p90: ${formatDurationShort(s.p90ResponseSeconds)}` : undefined}
          />
          <StatTile
            label={tr("خرق SLA", "SLA breaches")}
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
        {data?.live?.exact ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-fg" aria-hidden />
        ) : (
          <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <div className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
          <p>
            {tr(
              "«الحمل الحالي» هو الحالة الآن (open / pending / snoozed) ولا تؤثر عليه الفترة المختارة. «أُسندت في الفترة» تعتمد على تاريخ الإسناد، و«أُنشئت في الفترة» تعتمد على تاريخ الإنشاء.",
              "Current workload is the live state (open / pending / snoozed) and ignores the selected period. Assigned in period uses the assignment date; created in period uses the creation date.",
            )}
          </p>
          <p className={cn("mt-1 font-semibold", data?.live?.exact ? "text-success-fg" : "text-warning-fg")}>
            {data?.live?.exact
              ? tr("تم التحقق من الحمل الحالي مباشرةً من Chatwoot.", "Current workload verified directly against Chatwoot.")
              : tr("تعذر التحقق الحي مع الفلاتر الحالية؛ المعروض من آخر مزامنة لقاعدة البيانات.", "Live verification is unavailable for these filters; showing the latest database snapshot.")}
            {data?.live?.difference ? ` ${tr("فرق المزامنة", "Sync difference")}: ${formatNumber(data.live.difference)}.` : ""}
          </p>
        </div>
      </div>

      <Section
        title={tr("أداء كل الموظفين", "All agents performance")}
        hint={tr("الفترة تحدد الأرقام، لا قائمة الموظفين", "The period changes the numbers, not who appears")}
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
              {tr("النشطون فقط", "Active only")}
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
                    ? tr("لا يوجد موظفون نشطون في الفترة المختارة", "No active agents in the selected period")
                    : tr("لا يوجد موظفون — شغِّل Sync من الإعدادات", "No agents — run a sync from Settings")
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
                        {!r.hasActivity && <div className="text-2xs text-muted-foreground">{tr("لا يوجد نشاط", "No activity")}</div>}
                      </div>
                      {r.needsReplyNow > 0 && <Badge tone="danger">{formatNumber(r.needsReplyNow)} {tr("تحتاج رد", "need reply")}</Badge>}
                    </div>

                    <StatStrip
                      className="mt-3"
                      items={[
                        { label: tr("الحمل الحالي", "Current"), value: formatNumber(r.currentWorkload), tone: "brand" },
                        { label: tr("مفتوحة الآن", "Open now"), value: formatNumber(r.currentOpen) },
                        { label: tr("أُسندت", "Assigned"), value: formatNumber(r.assignedInPeriod) },
                        {
                          label: tr("متوسط الرد", "Avg response"),
                          value: r.avgResponseSeconds != null ? formatDurationShort(r.avgResponseSeconds) : "—",
                        },
                      ]}
                    />
                  </button>
                </li>
              ))}
              {!(data?.rows ?? []).length && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  {activeOnly ? tr("لا يوجد موظفون نشطون في الفترة المختارة", "No active agents in the selected period") : tr("لا يوجد موظفون — شغِّل Sync من الإعدادات", "No agents — run a sync from Settings")}
                </li>
              )}
            </ul>
          </>
        )}
      </Section>
    </div>
  );
}
