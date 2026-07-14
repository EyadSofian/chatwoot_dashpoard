"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AlertTriangle, Timer, UserCheck, Users } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { AgentRow, AgentSummary } from "@/lib/reporting/agents";
import { Section, LoadingBlock, ErrorState, Badge, Avatar, StatTile, SkeletonCards, cn } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { formatDurationShort, formatNumber } from "@/lib/format";

/** A metric an inactive agent simply doesn't have — show a dash, not a zero. */
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
  const dur = (v: number | null) =>
    v === null ? dash : <span className="tnum">{formatDurationShort(v)}</span>;

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
            {!r.hasActivity && <div className="text-2xs text-muted-foreground">لا توجد محادثات في الفترة</div>}
          </div>
        </div>
      ),
    },
    { key: "assigned", header: "مُسند", align: "end", render: (r) => num(r.assigned) },
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
    { key: "open", header: "مفتوحة", align: "end", render: (r) => num(r.open) },
    { key: "resolved", header: "محلولة", align: "end", render: (r) => num(r.resolved) },
    { key: "pending", header: "منتظرة", align: "end", render: (r) => num(r.pending) },
    { key: "unread", header: "غير مقروءة", align: "end", render: (r) => num(r.unread) },
    { key: "avgResponseSeconds", header: "متوسط الرد", align: "end", render: (r) => dur(r.avgResponseSeconds) },
    { key: "medianResponseSeconds", header: "الوسيط", align: "end", render: (r) => dur(r.medianResponseSeconds) },
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
        <SkeletonCards count={4} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="إجمالي الموظفين"
            value={formatNumber(s?.totalAgents ?? 0)}
            icon={<Users className="h-[18px] w-[18px]" />}
            tone="brand"
          />
          <StatTile
            label="موظفون لديهم محادثات"
            value={formatNumber(s?.activeAgents ?? 0)}
            icon={<UserCheck className="h-[18px] w-[18px]" />}
            tone="success"
            sub={
              s && s.totalAgents > 0
                ? `${formatNumber(s.totalAgents - s.activeAgents)} بدون محادثات في الفترة`
                : undefined
            }
          />
          <StatTile
            label="متوسط الرد العام"
            value={s?.avgResponseSeconds != null ? formatDurationShort(s.avgResponseSeconds) : "—"}
            icon={<Timer className="h-[18px] w-[18px]" />}
            tone="violet"
            sub="من لحظة الإسناد لأول رد بشري"
          />
          <StatTile
            label="إجمالي خروقات SLA"
            value={formatNumber(s?.slaBreaches ?? 0)}
            icon={<AlertTriangle className="h-[18px] w-[18px]" />}
            tone="danger"
          />
        </div>
      )}

      <Section
        title="أداء كل الموظفين"
        hint="كل موظفي شات ووت ظاهرين هنا، والفترة المختارة تؤثر على الأرقام فقط وليس ظهور الموظفين"
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
              عرض الموظفين النشطين فقط
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
          <DataTable
            columns={columns}
            rows={data?.rows ?? []}
            getKey={(r) => r.agentId}
            onRowClick={(r) => router.push(`/agents/${r.agentId}`)}
            emptyTitle={
              activeOnly
                ? "لا يوجد موظفون نشطون في الفترة المختارة"
                : "لا يوجد موظفون — نفّذ Backfill من الإعدادات لمزامنتهم من Chatwoot"
            }
          />
        )}
      </Section>
    </div>
  );
}
