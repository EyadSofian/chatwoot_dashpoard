"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, MessagesSquare, Reply, Timer, UserCheck, UsersRound } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { TeamRow, TeamsSummary } from "@/lib/reporting/teams";
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

const dash = <span className="text-muted-foreground">—</span>;

export default function TeamsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [openTeam, setOpenTeam] = useState<number | null>(null);

  const activeOnly = searchParams.get("activeOnly") === "true";
  const { data, loading, error } = useApiData<{ rows: TeamRow[]; summary: TeamsSummary }>("/api/teams");

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
      header: "التيم",
      render: (r) => (
        <div className="min-w-0">
          <div className={cn("truncate font-semibold", r.hasActivity ? "text-foreground" : "text-muted-foreground")}>
            {r.name}
          </div>
          {!r.hasActivity ? (
            <div className="text-2xs text-muted-foreground">لا يوجد نشاط في الفترة المختارة</div>
          ) : (
            r.department && <DepartmentPill department={r.department} />
          )}
        </div>
      ),
    },
    // Trimmed to what you actually compare teams on. The rest lives in the sheet.
    { key: "memberCount", header: "الأعضاء", align: "end", render: (r) => num(r.memberCount) },
    { key: "conversations", header: "محادثات", align: "end", render: (r) => num(r.conversations) },
    { key: "open", header: "مفتوحة", align: "end", render: (r) => num(r.open) },
    {
      key: "needsReply",
      header: "تحتاج رد",
      align: "end",
      render: (r) => (
        <span className={cn("tnum", r.needsReply > 0 && "font-bold text-destructive-fg")}>
          {formatNumber(r.needsReply)}
        </span>
      ),
    },
    { key: "avgResponseSeconds", header: "متوسط الرد", align: "end", render: (r) => dur(r.avgResponseSeconds) },
    {
      key: "slaBreaches",
      header: "خرق SLA",
      align: "end",
      render: (r) =>
        r.slaBreaches ? <Badge tone="danger">{formatNumber(r.slaBreaches)}</Badge> : r.hasActivity ? num(0) : dash,
    },
    { key: "campaignReplies", header: "ردود الكامبين", align: "end", render: (r) => num(r.campaignReplies) },
  ];

  const s = data?.summary;

  return (
    <div className="space-y-5">
      {loading && !data ? (
        <SkeletonCards count={6} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatTile
            label="إجمالي التيمات"
            value={formatNumber(s?.totalTeams ?? 0)}
            icon={<UsersRound className="h-[18px] w-[18px]" />}
            tone="brand"
          />
          <StatTile
            label="تيمات لديها نشاط"
            value={formatNumber(s?.activeTeams ?? 0)}
            icon={<UserCheck className="h-[18px] w-[18px]" />}
            tone="success"
          />
          <StatTile
            label="إجمالي المحادثات"
            value={formatNumber(s?.conversations ?? 0)}
            icon={<MessagesSquare className="h-[18px] w-[18px]" />}
            tone="brand"
          />
          <StatTile
            label="متوسط الرد العام"
            value={s?.avgResponseSeconds != null ? formatDurationShort(s.avgResponseSeconds) : "—"}
            icon={<Timer className="h-[18px] w-[18px]" />}
            tone="violet"
          />
          <StatTile
            label="خروقات SLA"
            value={formatNumber(s?.slaBreaches ?? 0)}
            icon={<AlertTriangle className="h-[18px] w-[18px]" />}
            tone="danger"
          />
          <StatTile
            label="محادثات تحتاج رد"
            value={formatNumber(s?.needsReply ?? 0)}
            icon={<Reply className="h-[18px] w-[18px]" />}
            tone="warning"
          />
        </div>
      )}

      <Section
        title="أداء كل التيمات"
        hint="الفترة تحدد الأرقام، لا قائمة التيمات"
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
              النشطة فقط
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
                    ? "لا توجد تيمات نشطة في الفترة المختارة"
                    : "لا توجد تيمات — شغِّل Sync من الإعدادات"
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
                              {formatNumber(r.memberCount)} عضو
                            </span>
                          </div>
                        </div>
                        {r.needsReply > 0 && <Badge tone="danger">{formatNumber(r.needsReply)} تحتاج رد</Badge>}
                      </div>

                      {!r.hasActivity ? (
                        <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                          لا يوجد نشاط في الفترة المختارة
                        </p>
                      ) : (
                        <StatStrip
                          className="mt-3"
                          items={[
                            { label: "محادثات", value: formatNumber(r.conversations) },
                            { label: "مفتوحة", value: formatNumber(r.open) },
                            {
                              label: "متوسط الرد",
                              value: r.avgResponseSeconds != null ? formatDurationShort(r.avgResponseSeconds) : "—",
                              tone: "brand",
                            },
                            {
                              label: "خرق SLA",
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
                    ? "لا توجد تيمات نشطة في الفترة المختارة"
                    : "لا توجد تيمات — شغِّل Sync من الإعدادات"}
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
