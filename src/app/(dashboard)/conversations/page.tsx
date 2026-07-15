"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import type { ConversationsPage } from "@/lib/reporting/conversations";
import { Section, LoadingBlock, ErrorState, StatusPill, DepartmentPill, NeedsReplyDot, Badge } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { ConversationDrawer } from "@/components/ConversationDrawer";
import { formatDurationShort, formatNumber, formatDateTime } from "@/lib/format";
import { useLocale } from "@/lib/i18n";

type Row = ConversationsPage["rows"][number];

export default function ConversationsPage() {
  const { tr } = useLocale();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("lastMessageAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [convId, setConvId] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set(["teamName", "inboxName", "unreadCount"]));

  // Deep-link support: open drawer if ?conv= is present on load.
  useEffect(() => {
    const c = searchParams.get("conv");
    if (c && Number.isFinite(Number(c))) setConvId(Number(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset to page 1 whenever the global filters change.
  useEffect(() => setPage(1), [qs]);

  const { data, loading, error } = useApiData<ConversationsPage>("/api/conversations", { page, pageSize: 50, sortBy, sortDir });

  const onSort = (key: string) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("desc");
    }
  };

  const allColumns: Column<Row>[] = [
    { key: "contactName", header: tr("العميل", "Customer"), render: (r) => <span className="font-medium text-primary">{r.contactName || `#${r.chatwootId}`}</span> },
    { key: "contactPhone", header: tr("الهاتف", "Phone"), render: (r) => <span className="tnum text-muted-foreground ltr-nums">{r.contactPhone || "—"}</span> },
    { key: "status", header: tr("الحالة", "Status"), sortable: true, render: (r) => <StatusPill status={r.status} /> },
    { key: "assigneeName", header: tr("الموظف", "Agent"), render: (r) => r.assigneeName || "—" },
    { key: "teamName", header: tr("الفريق", "Team"), render: (r) => r.teamName || "—" },
    { key: "department", header: tr("القسم", "Department"), sortable: true, render: (r) => <DepartmentPill department={r.department} /> },
    { key: "inboxName", header: tr("القناة", "Channel"), render: (r) => r.inboxName || "—" },
    { key: "responseSeconds", header: tr("زمن الرد", "Response time"), sortable: true, render: (r) => <span className="tnum">{formatDurationShort(r.responseSeconds)}</span> },
    { key: "conversationDurationSeconds", header: tr("المدة", "Duration"), sortable: true, render: (r) => <span className="tnum">{formatDurationShort(r.conversationDurationSeconds)}</span> },
    { key: "campaignLabel", header: tr("الكامبين", "Campaign"), render: (r) => (r.campaignLabel ? <Badge tone="primary">{r.campaignLabel}</Badge> : "—") },
    { key: "botInvolved", header: tr("فهد", "Fahd"), render: (r) => (r.botInvolved ? <Badge tone="warning">نعم</Badge> : "—") },
    { key: "unreadCount", header: tr("غير مقروء", "Unread"), render: (r) => <span className="tnum">{formatNumber(r.unreadCount)}</span> },
    { key: "needsReply", header: tr("يحتاج رد", "Needs reply"), render: (r) => <NeedsReplyDot value={r.needsReply} /> },
    { key: "lastMessageAt", header: tr("آخر رسالة", "Last message"), sortable: true, render: (r) => <span className="text-xs text-muted-foreground">{formatDateTime(r.lastMessageAt)}</span> },
  ];
  const columns = allColumns.filter((c) => !hidden.has(c.key));

  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <Section
        title={`${tr("المحادثات", "Conversations")} (${formatNumber(total)})`}
        action={
          <div className="flex items-center gap-2">
            <ColumnChooser columns={allColumns} hidden={hidden} setHidden={setHidden} />
            <ExportButton dataset="conversations" />
          </div>
        }
      >
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="p-4"><ErrorState message={error} /></div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.rows ?? []}
              getKey={(r) => r.chatwootId}
              onRowClick={(r) => setConvId(r.chatwootId)}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={onSort}
              emptyTitle={tr("لا توجد محادثات مطابقة", "No matching conversations")}
            />
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              <span>{tr("صفحة", "Page")} {formatNumber(page)} {tr("من", "of")} {formatNumber(totalPages)}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-lg border border-border p-1.5 disabled:opacity-40 cursor-pointer" aria-label={tr("السابق", "Previous")}>
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-lg border border-border p-1.5 disabled:opacity-40 cursor-pointer" aria-label={tr("التالي", "Next")}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </Section>

      {convId !== null && <ConversationDrawer conversationId={convId} onClose={() => setConvId(null)} />}
    </div>
  );
}

function ColumnChooser({ columns, hidden, setHidden }: { columns: Column<Row>[]; hidden: Set<string>; setHidden: (s: Set<string>) => void }) {
  const { tr } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
        <SlidersHorizontal className="h-3.5 w-3.5" /> {tr("الأعمدة", "Columns")}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 max-h-72 w-48 overflow-y-auto rounded-lg border border-border bg-surface p-2 shadow-pop" style={{ insetInlineEnd: 0 }}>
            {columns.map((c) => (
              <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-surface-2">
                <input
                  type="checkbox"
                  checked={!hidden.has(c.key)}
                  onChange={() => {
                    const next = new Set(hidden);
                    if (next.has(c.key)) next.delete(c.key);
                    else next.add(c.key);
                    setHidden(next);
                  }}
                />
                {c.header}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
