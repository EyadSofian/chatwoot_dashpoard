"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, MessagesSquare, Reply, Timer, UserCheck, UsersRound } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { TeamRow, TeamsReport } from "@/lib/reporting/teams";
import { NO_TEAM_ID } from "@/lib/reporting/teams";
import {
  Badge,
  cn,
  DepartmentPill,
  ErrorState,
  LoadingBlock,
  Section,
  SkeletonCards,
  StatTile,
  StatStrip,
} from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { TeamDrawer } from "@/components/TeamDrawer";
import { formatDateTime, formatDurationShort, formatNumber } from "@/lib/format";
import { useLocale } from "@/lib/i18n";

const dash = <span className="text-muted-foreground">—</span>;

export default function TeamsPage() {
  const { tr } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [openTeam, setOpenTeam] = useState<number | null>(null);

  const activeOnly = searchParams.get("activeOnly") === "true";
  const { data, loading, error } = useApiData<TeamsReport>("/api/teams");

  const toggleActiveOnly = (on: boolean) => {
    const next = new URLSearchParams(searchParams.toString());
    if (on) next.set("activeOnly", "true");
    else next.delete("activeOnly");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const num = (v: number) => <span className="tnum">{formatNumber(v)}</span>;
  const dur = (v: number | null) => (v === null ? dash : <span className="tnum">{formatDurationShort(v)}</span>);

  const columns: Column<TeamRow>[] = [
    {
      key: "name",
      header: tr("التيم", "Team"),
      render: (r) => (
        <div className="min-w-0">
          <div className={cn("truncate font-semibold", r.hasActivity ? "text-foreground" : "text-muted-foreground")}>
            {r.name}
          </div>
          {!r.hasActivity ? (
            <div className="text-2xs text-muted-foreground">{tr("لا يوجد نشاط في الفترة المختارة", "No activity in the selected period")}</div>
          ) : (
            r.department && <DepartmentPill department={r.department} />
          )}
        </div>
      ),
    },
    // Trimmed to what you actually compare teams on. The rest lives in the sheet.
    { key: "memberCount", header: tr("الأعضاء", "Members"), align: "end", render: (r) => num(r.memberCount) },
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
    { key: "conversations", header: tr("محادثات الفترة", "Conversations (period)"), align: "end", render: (r) => num(r.conversations) },
    { key: "open", header: tr("مفتوحة", "Open"), align: "end", render: (r) => num(r.open) },
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
    {
      key: "slaBreaches",
      header: tr("خرق SLA", "SLA breaches"),
      align: "end",
      render: (r) =>
        r.slaBreaches ? <Badge tone="danger">{formatNumber(r.slaBreaches)}</Badge> : r.hasActivity ? num(0) : dash,
    },
    { key: "campaignReplies", header: tr("ردود الكامبين", "Campaign replies"), align: "end", render: (r) => num(r.campaignReplies) },
  ];

  const s = data?.summary;

  return (
    <div className="space-y-5">
      {loading && !data ? (
        <SkeletonCards count={6} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatTile
            label={tr("إجمالي التيمات", "Total teams")}
            value={formatNumber(s?.totalTeams ?? 0)}
            icon={<UsersRound className="h-[18px] w-[18px]" />}
            tone="brand"
          />
          <StatTile
            label={tr("تيمات لديها نشاط", "Active teams")}
            value={formatNumber(s?.activeTeams ?? 0)}
            icon={<UserCheck className="h-[18px] w-[18px]" />}
            tone="success"
          />
          <StatTile
            label={tr("إجمالي المحادثات", "Total conversations")}
            value={formatNumber(s?.conversations ?? 0)}
            icon={<MessagesSquare className="h-[18px] w-[18px]" />}
            tone="brand"
          />
          <StatTile
            label={tr("متوسط الرد العام", "Overall avg response")}
            value={s?.avgResponseSeconds != null ? formatDurationShort(s.avgResponseSeconds) : "—"}
            icon={<Timer className="h-[18px] w-[18px]" />}
            tone="violet"
          />
          <StatTile
            label={tr("خروقات SLA", "SLA breaches")}
            value={formatNumber(s?.slaBreaches ?? 0)}
            icon={<AlertTriangle className="h-[18px] w-[18px]" />}
            tone="danger"
          />
          <StatTile
            label={tr("محادثات تحتاج رد", "Conversations needing reply")}
            value={formatNumber(s?.needsReply ?? 0)}
            icon={<Reply className="h-[18px] w-[18px]" />}
            tone="warning"
          />
        </div>
      )}

      {data && (
        <div className="flex items-start gap-3 rounded-card border border-border bg-muted px-4 py-3 text-xs">
          <CheckCircle2
            className={cn("mt-0.5 h-4 w-4 shrink-0", data.live?.exact ? "text-success-fg" : "text-warning-fg")}
            aria-hidden
          />
          <p className={cn("leading-relaxed", data.live?.exact ? "text-success-fg" : "text-warning-fg")}>
            {data.live?.exact
              ? tr("تم التحقق من الحمل الحالي لكل تيم مباشرةً من Chatwoot.", "Current team workload verified directly against Chatwoot.")
              : tr("التحقق الحي غير متاح مع الفلاتر الحالية؛ الحمل الحالي من آخر مزامنة.", "Live verification is unavailable for these filters; current workload uses the latest sync.")}
            {data.live?.difference ? ` ${tr("فرق المزامنة", "Sync difference")}: ${formatNumber(data.live.difference)}.` : ""}
          </p>
        </div>
      )}

      <Section
        title={tr("أداء كل التيمات", "All teams performance")}
        hint={tr("الفترة تحدد الأرقام، لا قائمة التيمات", "The period changes the numbers, not who appears")}
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
            <ExportButton dataset="teams" />
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
            {/* Desktop: a table you scan across teams. */}
            <div className="hidden lg:block">
              <DataTable
                columns={columns}
                rows={data?.rows ?? []}
                getKey={(r) => r.teamCwId}
                // The unattributed bucket is a footnote, not a team — nothing to open.
                onRowClick={(r) => (r.teamCwId === NO_TEAM_ID ? undefined : setOpenTeam(r.teamCwId))}
                emptyTitle={
                  activeOnly
                    ? tr("لا توجد تيمات نشطة في الفترة المختارة", "No active teams in the selected period")
                    : tr("لا توجد تيمات — شغِّل Sync من الإعدادات", "No teams — run a sync from Settings")
                }
              />
            </div>

            {/* Mobile: tappable cards. A 13-column table dragged sideways is not a report. */}
            <ul className="space-y-3 p-4 lg:hidden">
              {(data?.rows ?? []).map((r) => {
                const isBucket = r.teamCwId === NO_TEAM_ID;
                return (
                  <li key={r.teamCwId}>
                    <button
                      disabled={isBucket}
                      onClick={() => setOpenTeam(r.teamCwId)}
                      className={cn(
                        "w-full rounded-card border border-border bg-surface p-4 text-start transition-shadow",
                        isBucket ? "cursor-default opacity-70" : "cursor-pointer hover:shadow-card-hover",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div
                            className={cn(
                              "truncate font-bold",
                              r.hasActivity ? "text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {r.name}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            {r.department && <DepartmentPill department={r.department} />}
                            <span className="text-2xs text-muted-foreground">
                              {formatNumber(r.memberCount)} {tr("عضو", "members")}
                            </span>
                          </div>
                        </div>
                        {r.needsReply > 0 && <Badge tone="danger">{formatNumber(r.needsReply)} {tr("تحتاج رد", "need reply")}</Badge>}
                      </div>

                      {!r.hasActivity ? (
                        <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                          {tr("لا يوجد نشاط في الفترة المختارة", "No activity in the selected period")}
                        </p>
                      ) : (
                        <StatStrip
                          className="mt-3"
                          items={[
                            { label: tr("الحمل الحالي", "Current"), value: formatNumber(r.currentWorkload), tone: "brand" },
                            { label: tr("محادثات الفترة", "Conversations"), value: formatNumber(r.conversations) },
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
                      )}
                    </button>
                  </li>
                );
              })}
              {!(data?.rows ?? []).length && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  {activeOnly
                    ? tr("لا توجد تيمات نشطة في الفترة المختارة", "No active teams in the selected period")
                    : tr("لا توجد تيمات — شغِّل Sync من الإعدادات", "No teams — run a sync from Settings")}
                </li>
              )}
            </ul>
          </>
        )}
      </Section>

      {openTeam !== null && <TeamDrawer teamId={openTeam} onClose={() => setOpenTeam(null)} />}
    </div>
  );
}
