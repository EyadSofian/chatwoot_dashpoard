"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { TeamMemberRow, TeamRow } from "@/lib/reporting/teams";
import { Avatar, Badge, cn, EmptyState, MiniStat, Spinner, StatusPill } from "@/components/ui";
import { formatDateTime, formatDurationShort, formatNumber } from "@/lib/format";
import { useLocale } from "@/lib/i18n";

interface TeamDetail {
  team: { id: number; name: string | null; department: string | null } | null;
  row: TeamRow | null;
  members: TeamMemberRow[];
}

interface TeamConversations {
  rows: {
    chatwootId: number;
    contactName: string | null;
    assigneeName: string | null;
    assigneeCwId: number | null;
    status: string | null;
    needsReply: boolean;
    responseSeconds: number | null;
    lastMessageAt: string | null;
  }[];
  total: number;
  page: number;
  pages: number;
}

const dash = <span className="text-muted-foreground">—</span>;
const dur = (v: number | null) => (v === null ? dash : <span className="tnum">{formatDurationShort(v)}</span>);

export function TeamDrawer({ teamId, onClose }: { teamId: number; onClose: () => void }) {
  const { tr } = useLocale();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const [agentFilter, setAgentFilter] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  // Esc closes, and the page behind must not scroll while the sheet is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const { data, loading, error } = useApiData<TeamDetail>(`/api/teams/${teamId}`);
  const { data: convs, loading: convsLoading } = useApiData<TeamConversations>(
    `/api/teams/${teamId}/conversations`,
    { page, pageSize: 25, memberId: agentFilter ?? undefined },
  );

  const row = data?.row;
  const teamName = data?.team?.name ?? row?.name ?? `${tr("تيم", "Team")} #${teamId}`;

  const selectAgent = (agentId: number | null) => {
    setAgentFilter(agentId);
    setPage(1);
  };

  const exportQs = (dataset: string) => {
    const params = new URLSearchParams(qs);
    params.set("teamId", String(teamId));
    if (agentFilter !== null) params.set("memberId", String(agentFilter));
    else params.delete("memberId");
    return `/api/export/${dataset}?${params.toString()}`;
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      {/*
        Mobile: fullscreen sheet — a 620px drawer on a 375px screen is a squeeze,
        not a report. Desktop: a side sheet anchored on the LEFT, the opposite
        edge from the RTL sidebar, so the two never fight for the same space.
      */}
      <aside
        className={cn(
          "fixed z-50 flex flex-col border-border bg-surface shadow-pop",
          "inset-0 h-[100dvh] w-full",
          "lg:inset-y-0 lg:start-auto lg:h-[100dvh] lg:w-full lg:max-w-[640px] lg:border-e",
        )}
        style={{ left: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label={teamName}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-extrabold tracking-tight">{teamName}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {row
                ? `${data?.team?.department ?? row.department ?? "—"} · ${formatNumber(row.memberCount)} ${tr("عضو", "members")} · ${formatNumber(row.conversations)} ${tr("محادثة", "conversations")}`
                : "…"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={tr("إغلاق", "Close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {loading && (
            <div className="flex justify-center p-10">
              <Spinner />
            </div>
          )}
          {error && <div className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive-fg">{error}</div>}

          {row && (
            <>
              {!row.hasActivity && (
                <div className="mb-4 rounded-card border border-border bg-muted px-4 py-3 text-sm font-medium text-muted-foreground">
                  {tr("لا يوجد نشاط في الفترة المختارة", "No activity in the selected period")}
                </div>
              )}

              {/* KPI cards */}
              <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <MiniStat label={tr("الحمل الحالي", "Current workload")} value={formatNumber(row.currentWorkload)} tone="brand" />
                <MiniStat label={tr("مفتوحة الآن", "Open now")} value={formatNumber(row.currentOpen)} />
                <MiniStat label={tr("محادثات الفترة", "Period conversations")} value={formatNumber(row.conversations)} tone="brand" />
                <MiniStat label={tr("تحتاج رد", "Needs reply")} value={formatNumber(row.needsReply)} tone="warning" />
                <MiniStat label={tr("خرق SLA", "SLA breaches")} value={formatNumber(row.slaBreaches)} tone="danger" />
                <MiniStat
                  label={tr("متوسط الرد", "Avg response")}
                  value={row.avgResponseSeconds != null ? formatDurationShort(row.avgResponseSeconds) : "—"}
                  tone="violet"
                />
              </div>
              <div className="mb-5 flex flex-wrap gap-x-4 gap-y-1 border-b border-border pb-4 text-2xs text-muted-foreground">
                <span>{tr("محلولة", "Resolved")}: <strong className="text-foreground tnum">{formatNumber(row.resolved)}</strong></span>
                <span>{tr("متوسط الإغلاق", "Avg resolution")}: <strong className="text-foreground tnum">{row.avgResolutionSeconds != null ? formatDurationShort(row.avgResolutionSeconds) : "—"}</strong></span>
                <span>{tr("ردود كامبين", "Campaign replies")}: <strong className="text-foreground tnum">{formatNumber(row.campaignReplies)}</strong></span>
                <span>{tr("تسليمات فهد", "Fahd handoffs")}: <strong className="text-foreground tnum">{formatNumber(row.botHandoffs)}</strong></span>
              </div>

              {/* Members */}
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">{tr("أعضاء التيم", "Team members")}</h3>
                <a href={exportQs("team-members")} className="btn-ghost rounded-full px-3 py-1.5 text-2xs">
                  {tr("تصدير الأعضاء", "Export members")}
                </a>
              </div>

              {/*
                Rows, not a table. Six numeric columns cannot be read on a phone,
                and tapping a member filters the conversation list below to their
                work INSIDE this team.
              */}
              {data.members.length === 0 ? (
                <EmptyState title={tr("لا يوجد أعضاء", "No members")} hint={tr("شغِّل Sync من الإعدادات", "Run a sync from Settings")} />
              ) : (
                <ul className="mb-6 space-y-2">
                  {data.members.map((m) => {
                    const selected = agentFilter === m.agentId;
                    return (
                      <li key={m.agentId}>
                        <button
                          onClick={() => selectAgent(selected ? null : m.agentId)}
                          aria-pressed={selected}
                          className={cn(
                            "w-full cursor-pointer rounded-xl border p-3 text-start transition-colors",
                            selected
                              ? "border-primary/40 bg-primary/5"
                              : "border-border bg-surface hover:border-primary/30 hover:bg-muted",
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <Avatar name={m.name} className="h-9 w-9" />
                            <div className="min-w-0 flex-1">
                              <div
                                className={cn(
                                  "truncate font-semibold",
                                  m.hasActivity ? "text-foreground" : "text-muted-foreground",
                                )}
                              >
                                {m.name}
                              </div>
                              {!m.hasActivity && (
                                <div className="text-2xs text-muted-foreground">{tr("لا نشاط في الفترة", "No activity in the period")}</div>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {m.needsReply > 0 && <Badge tone="danger">{formatNumber(m.needsReply)} {tr("تحتاج رد", "need reply")}</Badge>}
                              {m.slaBreaches > 0 && <Badge tone="warning">{formatNumber(m.slaBreaches)} SLA</Badge>}
                            </div>
                          </div>

                          {m.hasActivity && (
                            <dl className="mt-2.5 grid grid-cols-4 gap-2 text-center">
                              <div>
                                <dd className="text-sm font-bold tnum">{formatNumber(m.currentWorkload)}</dd>
                                <dt className="text-2xs text-muted-foreground">{tr("الحمل الحالي", "Current")}</dt>
                              </div>
                              <div>
                                <dd className="text-sm font-bold tnum">{formatNumber(m.openLoad)}</dd>
                                <dt className="text-2xs text-muted-foreground">{tr("مفتوحة الآن", "Open now")}</dt>
                              </div>
                              <div>
                                <dd className="text-sm font-bold tnum">{formatNumber(m.assigned)}</dd>
                                <dt className="text-2xs text-muted-foreground">{tr("محادثات الفترة", "Period")}</dt>
                              </div>
                              <div>
                                <dd className="text-sm font-bold tnum">{dur(m.avgResponseSeconds)}</dd>
                                <dt className="text-2xs text-muted-foreground">{tr("متوسط الرد", "Avg response")}</dt>
                              </div>
                            </dl>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Conversations */}
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">
                  {tr("محادثات التيم", "Team conversations")}
                  {agentFilter && (
                    <button
                      onClick={() => selectAgent(null)}
                      className="ms-2 cursor-pointer text-2xs font-semibold text-primary hover:underline"
                    >
                      {tr("(إلغاء تصفية الموظف)", "(clear agent filter)")}
                    </button>
                  )}
                </h3>
                <a href={exportQs("team-conversations")} className="btn-ghost rounded-full px-3 py-1.5 text-2xs">
                  {tr("تصدير المحادثات", "Export conversations")}
                </a>
              </div>

              {convsLoading ? (
                <div className="flex justify-center p-6">
                  <Spinner />
                </div>
              ) : (convs?.rows ?? []).length === 0 ? (
                <EmptyState title={tr("لا توجد محادثات في الفترة", "No conversations in the period")} />
              ) : (
                <>
                  <ul className="space-y-2">
                    {(convs?.rows ?? []).map((c) => (
                      <li key={c.chatwootId} className="rounded-xl border border-border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`/conversations?conv=${c.chatwootId}`}
                            className="truncate font-semibold text-foreground hover:text-primary hover:underline"
                          >
                            {c.contactName || `#${c.chatwootId}`}
                          </Link>
                          <StatusPill status={c.status} />
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
                          <span>{c.assigneeName || tr("غير مُسند", "Unassigned")}</span>
                          <span>{tr("زمن الرد", "Response")}: {c.responseSeconds != null ? formatDurationShort(c.responseSeconds) : "—"}</span>
                          {c.lastMessageAt && <span>{formatDateTime(c.lastMessageAt)}</span>}
                          {c.needsReply && <span className="font-bold text-destructive-fg">{tr("يحتاج رد", "Needs reply")}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {convs && convs.pages > 1 && (
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="btn-ghost px-3 py-1.5 text-xs"
                      >
                        {tr("السابق", "Previous")}
                      </button>
                      <span className="text-2xs text-muted-foreground tnum">
                        {tr("صفحة", "Page")} {formatNumber(convs.page)} {tr("من", "of")} {formatNumber(convs.pages)} · {formatNumber(convs.total)} {tr("محادثة", "conversations")}
                      </span>
                      <button
                        disabled={page >= convs.pages}
                        onClick={() => setPage((p) => p + 1)}
                        className="btn-ghost px-3 py-1.5 text-xs"
                      >
                        {tr("التالي", "Next")}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
