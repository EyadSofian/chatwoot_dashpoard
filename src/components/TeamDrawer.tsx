"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { TeamMemberRow, TeamRow } from "@/lib/reporting/teams";
import { Avatar, Badge, cn, EmptyState, MiniStat, Spinner, StatusPill } from "@/components/ui";
import { formatDateTime, formatDurationShort, formatNumber } from "@/lib/format";

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
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const [agentFilter, setAgentFilter] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const { data, loading, error } = useApiData<TeamDetail>(`/api/teams/${teamId}`);
  const { data: convs, loading: convsLoading } = useApiData<TeamConversations>(
    `/api/teams/${teamId}/conversations`,
    { page, pageSize: 25 },
  );

  const row = data?.row;
  const teamName = data?.team?.name ?? row?.name ?? `تيم #${teamId}`;

  // Selecting a member narrows the conversation list to that agent, inside this
  // team only — an agent in two teams never drags the other team's work in.
  const visibleConvs = agentFilter
    ? (convs?.rows ?? []).filter((c) => c.assigneeCwId === agentFilter)
    : (convs?.rows ?? []);

  const exportQs = (dataset: string) =>
    `/api/export/${dataset}?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(qs)), teamId: String(teamId) }).toString()}`;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-navy/30 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <aside
        className="fixed inset-y-0 z-50 flex w-full max-w-[620px] flex-col border-e border-border bg-surface shadow-pop"
        style={{ left: 0 }}
        role="dialog"
        aria-label={teamName}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-extrabold tracking-tight">{teamName}</h2>
            <p className="text-xs text-muted-foreground">
              {row ? `${formatNumber(row.memberCount)} عضو · ${formatNumber(row.conversations)} محادثة في الفترة` : "…"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-xl border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
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
                  لا يوجد نشاط لهذا التيم خلال الفترة المختارة
                </div>
              )}

              {/* KPI cards */}
              <div className="mb-5 grid grid-cols-3 gap-2.5">
                <MiniStat label="محادثات" value={formatNumber(row.conversations)} tone="brand" />
                <MiniStat label="مفتوحة" value={formatNumber(row.open)} />
                <MiniStat label="محلولة" value={formatNumber(row.resolved)} tone="success" />
                <MiniStat label="تحتاج رد" value={formatNumber(row.needsReply)} tone="warning" />
                <MiniStat label="خرق SLA" value={formatNumber(row.slaBreaches)} tone="danger" />
                <MiniStat
                  label="متوسط الرد"
                  value={row.avgResponseSeconds != null ? formatDurationShort(row.avgResponseSeconds) : "—"}
                  tone="violet"
                />
                <MiniStat
                  label="متوسط الإغلاق"
                  value={row.avgResolutionSeconds != null ? formatDurationShort(row.avgResolutionSeconds) : "—"}
                />
                <MiniStat label="ردود كامبين" value={formatNumber(row.campaignReplies)} tone="brand" />
                <MiniStat label="تسليمات فهد" value={formatNumber(row.botHandoffs)} tone="violet" />
              </div>

              {/* Members */}
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">أعضاء التيم</h3>
                <a href={exportQs("team-members")} className="btn-ghost rounded-full px-3 py-1.5 text-2xs">
                  تصدير الأعضاء
                </a>
              </div>

              {data.members.length === 0 ? (
                <EmptyState title="لا يوجد أعضاء" hint="نفّذ مزامنة التيمات من الإعدادات." />
              ) : (
                <div className="mb-6 overflow-x-auto rounded-card border border-border">
                  <table className="w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr>
                        {["الموظف", "مُسند", "تم الرد", "تحتاج رد", "متوسط الرد", "خرق"].map((h, i) => (
                          <th
                            key={h}
                            className={cn(
                              "border-b border-border bg-surface-2 px-3 py-2.5 text-2xs font-bold uppercase text-muted-foreground",
                              i === 0 ? "text-start" : "text-end",
                            )}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.members.map((m) => {
                        const selected = agentFilter === m.agentId;
                        return (
                          <tr
                            key={m.agentId}
                            onClick={() => setAgentFilter(selected ? null : m.agentId)}
                            className={cn(
                              "cursor-pointer transition-colors",
                              selected ? "bg-primary/[0.07]" : "hover:bg-primary/[0.035]",
                            )}
                          >
                            <td className="border-b border-border/70 px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <Avatar name={m.name} className="h-7 w-7" />
                                <div className="min-w-0">
                                  <div
                                    className={cn(
                                      "truncate font-semibold",
                                      m.hasActivity ? "text-foreground" : "text-muted-foreground",
                                    )}
                                  >
                                    {m.name}
                                  </div>
                                  {!m.hasActivity && <div className="text-2xs text-muted-foreground">لا نشاط</div>}
                                </div>
                              </div>
                            </td>
                            <td className="border-b border-border/70 px-3 py-2.5 text-end tnum font-semibold">
                              {formatNumber(m.assigned)}
                            </td>
                            <td className="border-b border-border/70 px-3 py-2.5 text-end tnum">
                              {formatNumber(m.replied)}
                            </td>
                            <td
                              className={cn(
                                "border-b border-border/70 px-3 py-2.5 text-end tnum",
                                m.needsReply > 0 && "font-bold text-destructive-fg",
                              )}
                            >
                              {formatNumber(m.needsReply)}
                            </td>
                            <td className="border-b border-border/70 px-3 py-2.5 text-end">
                              {dur(m.avgResponseSeconds)}
                            </td>
                            <td className="border-b border-border/70 px-3 py-2.5 text-end">
                              {m.slaBreaches ? (
                                <Badge tone="danger">{formatNumber(m.slaBreaches)}</Badge>
                              ) : (
                                <span className="tnum text-muted-foreground">0</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Conversations */}
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">
                  محادثات التيم
                  {agentFilter && (
                    <button
                      onClick={() => setAgentFilter(null)}
                      className="ms-2 cursor-pointer text-2xs font-semibold text-primary hover:underline"
                    >
                      (إلغاء تصفية الموظف)
                    </button>
                  )}
                </h3>
                <a href={exportQs("team-conversations")} className="btn-ghost rounded-full px-3 py-1.5 text-2xs">
                  تصدير المحادثات
                </a>
              </div>

              {convsLoading ? (
                <div className="flex justify-center p-6">
                  <Spinner />
                </div>
              ) : visibleConvs.length === 0 ? (
                <EmptyState title="لا توجد محادثات في الفترة" />
              ) : (
                <>
                  <ul className="space-y-2">
                    {visibleConvs.map((c) => (
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
                          <span>{c.assigneeName || "غير مُسند"}</span>
                          <span>زمن الرد: {c.responseSeconds != null ? formatDurationShort(c.responseSeconds) : "—"}</span>
                          {c.lastMessageAt && <span>{formatDateTime(c.lastMessageAt)}</span>}
                          {c.needsReply && <span className="font-bold text-destructive-fg">يحتاج رد</span>}
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
                        السابق
                      </button>
                      <span className="text-2xs text-muted-foreground tnum">
                        صفحة {formatNumber(convs.page)} من {formatNumber(convs.pages)} · {formatNumber(convs.total)} محادثة
                      </span>
                      <button
                        disabled={page >= convs.pages}
                        onClick={() => setPage((p) => p + 1)}
                        className="btn-ghost px-3 py-1.5 text-xs"
                      >
                        التالي
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
