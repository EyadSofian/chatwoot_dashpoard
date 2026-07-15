"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { AgentRow } from "@/lib/reporting/agents";
import { Kpi, Card, CardTitle, Section, LoadingBlock, ErrorState, StatusPill, DepartmentPill, NeedsReplyDot, Badge } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { formatDurationShort, formatNumber, formatDateTime } from "@/lib/format";
import { useLocale } from "@/lib/i18n";

interface AgentDetail {
  agent: { id: number; name: string | null; email: string | null; availability: string | null; role: string | null } | null;
  summary: AgentRow | null;
  conversations: {
    rows: Array<{
    chatwootId: number;
    contactName: string | null;
    contactPhone: string | null;
    status: string | null;
    department: string | null;
    inboxName: string | null;
    needsReply: boolean;
    responseSeconds: number | null;
    conversationDurationSeconds: number | null;
    campaignLabel: string | null;
    lastMessageAt: string | null;
    slaFirstResponseBreached: boolean;
    }>;
    total: number;
    page: number;
    pages: number;
  };
}

export default function AgentDetailPage() {
  const { tr } = useLocale();
  const params = useParams<{ id: string }>();
  const [page, setPage] = useState(1);
  const { data, loading, error } = useApiData<AgentDetail>(`/api/agents/${params.id}`, { page, pageSize: 50 });

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState message={error} />;
  const s = data?.summary;

  const columns: Column<AgentDetail["conversations"]["rows"][number]>[] = [
    { key: "contactName", header: tr("العميل", "Customer"), render: (r) => <Link href={`/conversations?conv=${r.chatwootId}`} className="font-medium text-primary hover:underline">{r.contactName || `#${r.chatwootId}`}</Link> },
    { key: "contactPhone", header: tr("الهاتف", "Phone"), render: (r) => <span className="tnum text-muted-foreground ltr-nums">{r.contactPhone || "—"}</span> },
    { key: "status", header: tr("الحالة", "Status"), render: (r) => <StatusPill status={r.status} /> },
    { key: "department", header: tr("القسم", "Department"), render: (r) => <DepartmentPill department={r.department} /> },
    { key: "needsReply", header: tr("يحتاج رد", "Needs reply"), render: (r) => <NeedsReplyDot value={r.needsReply} /> },
    { key: "responseSeconds", header: tr("زمن الرد", "Response time"), render: (r) => <span className="tnum">{formatDurationShort(r.responseSeconds)}</span> },
    { key: "conversationDurationSeconds", header: tr("المدة", "Duration"), render: (r) => <span className="tnum">{formatDurationShort(r.conversationDurationSeconds)}</span> },
    { key: "campaignLabel", header: tr("الكامبين", "Campaign"), render: (r) => (r.campaignLabel ? <Badge tone="primary">{r.campaignLabel}</Badge> : "—") },
    { key: "lastMessageAt", header: tr("آخر رسالة", "Last message"), render: (r) => <span className="text-xs text-muted-foreground">{formatDateTime(r.lastMessageAt)}</span> },
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
          <Kpi label={tr("الحمل الحالي", "Current workload")} value={formatNumber(s.currentWorkload)} tone="accent" sub={tr("الحالة الآن", "Live state")} />
          <Kpi label={tr("تحتاج رد الآن", "Needs reply now")} value={formatNumber(s.needsReplyNow)} tone="warning" />
          <Kpi label={tr("أُسندت في الفترة", "Assigned in period")} value={formatNumber(s.assignedInPeriod)} />
          <Kpi label={tr("أُنشئت في الفترة", "Created in period")} value={formatNumber(s.createdInPeriod)} />
          <Kpi label={tr("متوسط الرد", "Avg response")} value={formatDurationShort(s.avgResponseSeconds)} sub={s.p90ResponseSeconds != null ? `p90: ${formatDurationShort(s.p90ResponseSeconds)}` : undefined} />
          <Kpi label={tr("خرق SLA", "SLA breaches")} value={formatNumber(s.slaBreaches)} tone="danger" />
        </div>
      )}

      <Section title={tr("محادثات الموظف", "Agent conversations")}>
        <DataTable columns={columns} rows={data?.conversations.rows ?? []} getKey={(r) => r.chatwootId} emptyTitle={tr("لا توجد محادثات في هذه الفترة", "No conversations in this period")} />
        {data && data.conversations.pages > 1 && (
          <div className="flex min-h-14 items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs">
            <button className="btn-ghost px-3 py-2" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              {tr("السابق", "Previous")}
            </button>
            <span className="text-muted-foreground tnum">
              {tr("صفحة", "Page")} {formatNumber(data.conversations.page)} {tr("من", "of")} {formatNumber(data.conversations.pages)} · {formatNumber(data.conversations.total)}
            </span>
            <button className="btn-ghost px-3 py-2" disabled={page >= data.conversations.pages} onClick={() => setPage((value) => value + 1)}>
              {tr("التالي", "Next")}
            </button>
          </div>
        )}
      </Section>
    </div>
  );
}
