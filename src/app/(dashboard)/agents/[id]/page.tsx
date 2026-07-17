"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { AgentRow, DetailConversationRow, DetailConversations } from "@/lib/reporting/agents";
import { Kpi, Section, LoadingBlock, ErrorState, StatusPill, DepartmentPill, NeedsReplyDot, Badge } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { formatDurationShort, formatNumber, formatDateTime } from "@/lib/format";
import { useLocale } from "@/lib/i18n";

interface AgentDetail {
  agent: { id: number; name: string | null; email: string | null; availability: string | null; role: string | null } | null;
  summary: AgentRow | null;
  view: "current" | "history";
  live?: { source: "chatwoot" | "database"; snapshotAt: string | null };
  conversations: DetailConversations;
}

type Tab = "current" | "history";

export default function AgentDetailPage() {
  const { tr } = useLocale();
  const params = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("current");
  const [page, setPage] = useState(1);
  const { data, loading, error } = useApiData<AgentDetail>(`/api/agents/${params.id}`, { view: tab, page });

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    setTab(next);
    setPage(1);
  };

  const s = data?.summary;
  const conv = data?.conversations;

  const columns: Column<DetailConversationRow>[] = [
    { key: "contactName", header: tr("العميل", "Customer"), render: (r) => <Link href={`/conversations?conv=${r.chatwootId}`} className="font-medium text-primary hover:underline">{r.contactName || `#${r.chatwootId}`}</Link> },
    { key: "contactPhone", header: tr("الهاتف", "Phone"), render: (r) => <span className="tnum text-muted-foreground ltr-nums">{r.contactPhone || "—"}</span> },
    { key: "status", header: tr("الحالة", "Status"), render: (r) => <StatusPill status={r.status} /> },
    { key: "department", header: tr("القسم", "Department"), render: (r) => <DepartmentPill department={r.department} /> },
    { key: "needsReply", header: tr("يحتاج رد", "Needs reply"), render: (r) => <NeedsReplyDot value={r.needsReply} /> },
    {
      key: "responseSeconds",
      header: tr("زمن الرد", "Response time"),
      render: (r) =>
        r.responseSeconds != null ? (
          <span className="tnum">{formatDurationShort(r.responseSeconds)}</span>
        ) : (
          <span className="text-2xs text-muted-foreground" title={tr("لا يوجد سجل إسناد لقياس زمن الرد", "No assignment record to measure from")}>
            {r.inDatabase ? tr("غير معروف", "Unknown") : tr("غير مُستورَد", "Not ingested")}
          </span>
        ),
    },
    { key: "conversationDurationSeconds", header: tr("المدة", "Duration"), render: (r) => <span className="tnum">{formatDurationShort(r.conversationDurationSeconds)}</span> },
    { key: "campaignLabel", header: tr("الكامبين", "Campaign"), render: (r) => (r.campaignLabel ? <Badge tone="primary">{r.campaignLabel}</Badge> : "—") },
    { key: "lastMessageAt", header: tr("آخر نشاط", "Last activity"), render: (r) => <span className="text-xs text-muted-foreground">{formatDateTime(r.lastMessageAt)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/agents" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowRight className="h-3.5 w-3.5" /> {tr("كل الموظفين", "All agents")}
          </Link>
          <h2 className="text-xl font-bold">{data?.agent?.name || `${tr("موظف", "Agent")} #${params.id}`}</h2>
          <div className="text-xs text-muted-foreground">{data?.agent?.email || ""} {data?.agent?.availability ? `· ${data.agent.availability}` : ""}</div>
        </div>
      </div>

      {s && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label={tr("الحمل الحالي", "Current workload")} value={formatNumber(s.currentWorkload)} tone="accent" sub={tr("من Chatwoot الآن", "Live from Chatwoot")} />
          <Kpi label={tr("تحتاج رد الآن", "Needs reply now")} value={formatNumber(s.needsReplyNow)} tone="warning" />
          <Kpi label={tr("أُسندت في الفترة", "Assigned in period")} value={formatNumber(s.assignedInPeriod)} />
          <Kpi label={tr("أُنشئت في الفترة", "Created in period")} value={formatNumber(s.createdInPeriod)} />
          <Kpi label={tr("متوسط الرد", "Avg response")} value={formatDurationShort(s.avgResponseSeconds)} sub={s.p90ResponseSeconds != null ? `p90: ${formatDurationShort(s.p90ResponseSeconds)}` : undefined} />
          <Kpi label={tr("خرق SLA", "SLA breaches")} value={formatNumber(s.slaBreaches)} tone="danger" />
        </div>
      )}

      {/* Two number systems that must never be confused: what is on their plate
          right now (live) vs what happened during the period (history). */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-surface p-1 text-xs font-medium">
          <button
            className={tab === "current" ? "rounded-md bg-primary px-3 py-1.5 text-primary-foreground" : "rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground"}
            onClick={() => switchTab("current")}
          >
            {tr("الحمل الحالي", "Current workload")}
          </button>
          <button
            className={tab === "history" ? "rounded-md bg-primary px-3 py-1.5 text-primary-foreground" : "rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground"}
            onClick={() => switchTab("history")}
          >
            {tr("تاريخ الفترة", "Period history")}
          </button>
        </div>
        {conv && tab === "current" && (
          <span className="text-2xs text-muted-foreground">
            {conv.exact
              ? tr("مباشر من Chatwoot", "Live from Chatwoot")
              : tr("من قاعدة البيانات (Chatwoot غير متاح للفلتر الحالي)", "From the mirror (live filter unavailable)")}
            {conv.snapshotAt ? ` · ${formatDateTime(conv.snapshotAt)}` : ""}
          </span>
        )}
        {tab === "history" && (
          <span className="text-2xs text-muted-foreground">
            {tr("محادثات أُنشئت في الفترة المحددة", "Conversations created in the selected period")}
          </span>
        )}
      </div>

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        <Section
          title={tab === "current" ? tr("محادثات الحمل الحالي", "Current workload conversations") : tr("محادثات الفترة", "Period conversations")}
        >
          {/* Desktop: the full table. Mobile: purpose-built cards — a nine-column
              table is unreadable on a phone. */}
          <div className="hidden lg:block">
            <DataTable
              columns={columns}
              rows={conv?.rows ?? []}
              getKey={(r) => r.chatwootId}
              emptyTitle={tab === "current" ? tr("لا يوجد حمل حالي", "No current workload") : tr("لا توجد محادثات في هذه الفترة", "No conversations in this period")}
            />
          </div>

          <ul className="space-y-3 p-4 lg:hidden">
            {(conv?.rows ?? []).map((r) => (
              <li key={r.chatwootId} className="rounded-card border border-border bg-surface p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/conversations?conv=${r.chatwootId}`} className="min-w-0 truncate font-semibold text-primary hover:underline">
                    {r.contactName || `#${r.chatwootId}`}
                  </Link>
                  <StatusPill status={r.status} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
                  {r.contactPhone && <span className="tnum ltr-nums">{r.contactPhone}</span>}
                  <DepartmentPill department={r.department} />
                  {r.needsReply && <span className="inline-flex items-center gap-1 font-bold text-destructive-fg"><NeedsReplyDot value /> {tr("يحتاج رد", "Needs reply")}</span>}
                  {r.campaignLabel && <Badge tone="primary">{r.campaignLabel}</Badge>}
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border/70 pt-3 text-center">
                  <div>
                    <dd className="text-sm font-bold tnum">
                      {r.responseSeconds != null ? formatDurationShort(r.responseSeconds) : <span className="text-2xs font-medium text-muted-foreground">{r.inDatabase ? tr("غير معروف", "Unknown") : tr("غير مُستورَد", "Not ingested")}</span>}
                    </dd>
                    <dt className="text-2xs text-muted-foreground">{tr("زمن الرد", "Response")}</dt>
                  </div>
                  <div>
                    <dd className="text-sm font-bold tnum">{formatDurationShort(r.conversationDurationSeconds)}</dd>
                    <dt className="text-2xs text-muted-foreground">{tr("المدة", "Duration")}</dt>
                  </div>
                  <div>
                    <dd className="truncate text-2xs font-medium text-foreground">{formatDateTime(r.lastMessageAt)}</dd>
                    <dt className="text-2xs text-muted-foreground">{tr("آخر نشاط", "Last activity")}</dt>
                  </div>
                </dl>
              </li>
            ))}
            {!(conv?.rows ?? []).length && (
              <li className="p-6 text-center text-sm text-muted-foreground">
                {tab === "current" ? tr("لا يوجد حمل حالي", "No current workload") : tr("لا توجد محادثات في هذه الفترة", "No conversations in this period")}
              </li>
            )}
          </ul>

          {conv && conv.pages > 1 && (
            <div className="flex min-h-14 items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs">
              <button className="btn-ghost px-3 py-2" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                {tr("السابق", "Previous")}
              </button>
              <span className="text-muted-foreground tnum">
                {tr("صفحة", "Page")} {formatNumber(conv.page)} {tr("من", "of")} {formatNumber(conv.pages)} · {formatNumber(conv.total)}
              </span>
              <button className="btn-ghost px-3 py-2" disabled={page >= conv.pages} onClick={() => setPage((value) => value + 1)}>
                {tr("التالي", "Next")}
              </button>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
