"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { AgentRow } from "@/lib/reporting/agents";
import { Kpi, Card, CardTitle, Section, LoadingBlock, ErrorState, StatusPill, DepartmentPill, NeedsReplyDot, Badge } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { formatDurationShort, formatNumber, formatDateTime } from "@/lib/format";

interface AgentDetail {
  agent: { id: number; name: string | null; email: string | null; availability: string | null; role: string | null } | null;
  summary: AgentRow | null;
  conversations: Array<{
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
}

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, loading, error } = useApiData<AgentDetail>(`/api/agents/${params.id}`);

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState message={error} />;
  const s = data?.summary;

  const columns: Column<AgentDetail["conversations"][number]>[] = [
    { key: "contactName", header: "العميل", render: (r) => <Link href={`/conversations?conv=${r.chatwootId}`} className="font-medium text-primary hover:underline">{r.contactName || `#${r.chatwootId}`}</Link> },
    { key: "contactPhone", header: "الهاتف", render: (r) => <span className="tnum text-muted-foreground ltr-nums">{r.contactPhone || "—"}</span> },
    { key: "status", header: "الحالة", render: (r) => <StatusPill status={r.status} /> },
    { key: "department", header: "القسم", render: (r) => <DepartmentPill department={r.department} /> },
    { key: "needsReply", header: "يحتاج رد", render: (r) => <NeedsReplyDot value={r.needsReply} /> },
    { key: "responseSeconds", header: "زمن الرد", render: (r) => <span className="tnum">{formatDurationShort(r.responseSeconds)}</span> },
    { key: "conversationDurationSeconds", header: "المدة", render: (r) => <span className="tnum">{formatDurationShort(r.conversationDurationSeconds)}</span> },
    { key: "campaignLabel", header: "الكامبين", render: (r) => (r.campaignLabel ? <Badge tone="primary">{r.campaignLabel}</Badge> : "—") },
    { key: "lastMessageAt", header: "آخر رسالة", render: (r) => <span className="text-xs text-muted-foreground">{formatDateTime(r.lastMessageAt)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/agents" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowRight className="h-3.5 w-3.5" /> كل الموظفين
          </Link>
          <h2 className="text-xl font-bold">{data?.agent?.name || `موظف #${params.id}`}</h2>
          <div className="text-xs text-muted-foreground">{data?.agent?.email || ""} {data?.agent?.availability ? `· ${data.agent.availability}` : ""}</div>
        </div>
      </div>

      {s && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="الحمل الحالي" value={formatNumber(s.currentWorkload)} tone="accent" sub="الحالة الآن" />
          <Kpi label="تحتاج رد الآن" value={formatNumber(s.needsReplyNow)} tone="warning" />
          <Kpi label="أُسندت في الفترة" value={formatNumber(s.assignedInPeriod)} />
          <Kpi label="أُنشئت في الفترة" value={formatNumber(s.createdInPeriod)} />
          <Kpi label="متوسط الرد" value={formatDurationShort(s.avgResponseSeconds)} sub={s.p90ResponseSeconds != null ? `p90: ${formatDurationShort(s.p90ResponseSeconds)}` : undefined} />
          <Kpi label="خرق SLA" value={formatNumber(s.slaBreaches)} tone="danger" />
        </div>
      )}

      <Section title="محادثات الموظف">
        <DataTable columns={columns} rows={data?.conversations ?? []} getKey={(r) => r.chatwootId} emptyTitle="لا توجد محادثات في هذه الفترة" />
      </Section>
    </div>
  );
}
