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
            <div className="text-2xs text-muted-foreground">لا يوجد نشاط لهذا التيم خلال الفترة المختارة</div>
          ) : (
            r.department && <DepartmentPill department={r.department} />
          )}
        </div>
      ),
    },
    { key: "memberCount", header: "عدد الموظفين", align: "end", render: (r) => num(r.memberCount) },
    { key: "activeMembers", header: "موظفون نشطون", align: "end", render: (r) => num(r.activeMembers) },
    { key: "conversations", header: "محادثات", align: "end", render: (r) => num(r.conversations) },
    { key: "open", header: "مفتوحة", align: "end", render: (r) => num(r.open) },
    { key: "replied", header: "تم الرد", align: "end", render: (r) => num(r.replied) },
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
    { key: "medianResponseSeconds", header: "الوسيط", align: "end", render: (r) => dur(r.medianResponseSeconds) },
    { key: "maxResponseSeconds", header: "الأقصى", align: "end", render: (r) => dur(r.maxResponseSeconds) },
    { key: "avgResolutionSeconds", header: "متوسط الإغلاق", align: "end", render: (r) => dur(r.avgResolutionSeconds) },
    {
      key: "slaBreaches",
      header: "خرق SLA",
      align: "end",
      render: (r) =>
        r.slaBreaches ? <Badge tone="danger">{formatNumber(r.slaBreaches)}</Badge> : r.hasActivity ? num(0) : dash,
    },
    {
      key: "lastActivityAt",
      header: "آخر نشاط",
      align: "end",
      render: (r) =>
        r.lastActivityAt ? <span className="text-xs text-muted-foreground">{formatDateTime(r.lastActivityAt)}</span> : dash,
    },
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
        hint="كل تيمات شات ووت وكل أعضائها ظاهرين، والفترة المختارة تؤثر على الأداء فقط"
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
              عرض التيمات النشطة فقط
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
          <DataTable
            columns={columns}
            rows={data?.rows ?? []}
            getKey={(r) => r.teamCwId}
            // The unattributed bucket is a footnote, not a team — nothing to open.
            onRowClick={(r) => (r.teamCwId === NO_TEAM_ID ? undefined : setOpenTeam(r.teamCwId))}
            emptyTitle={
              activeOnly
                ? "لا توجد تيمات نشطة في الفترة المختارة"
                : "لا توجد تيمات — نفّذ مزامنة بيانات شات ووت من الإعدادات"
            }
          />
        )}
      </Section>

      {openTeam !== null && <TeamDrawer teamId={openTeam} onClose={() => setOpenTeam(null)} />}
    </div>
  );
}
