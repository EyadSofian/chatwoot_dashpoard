"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { useApiData } from "@/lib/client/api";
import { Spinner, Badge, cn } from "@/components/ui";
import { formatDurationShort, formatNumber, formatDateTime, formatPercent } from "@/lib/format";
import { useLocale } from "@/lib/i18n";

interface CampaignDetail {
  job: {
    jobId: string;
    labelName: string | null;
    originalLabelName: string | null;
    templateName: string | null;
    operatorName: string | null;
    inboxName: string | null;
    status: string | null;
    createdAtApp: string | null;
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    deliveryFailuresCount: number;
    sentTrackCount: number;
  };
  recipients: {
    rows: Array<{ id: string; phone: string | null; name: string | null; status: string | null; conversationCwId: number | null; errorDescription: string | null }>;
    total: number;
    page: number;
    pages: number;
  };
  replies: {
    rows: Array<{ conversationCwId: number; assigned: boolean; assigneeName: string | null; responseSeconds: number | null }>;
    total: number;
    page: number;
    pages: number;
  };
}

export function CampaignDrawer({ source, jobId, onClose }: { source: string; jobId: string; onClose: () => void }) {
  const { tr } = useLocale();
  const [recipientPage, setRecipientPage] = useState(1);
  const [replyPage, setReplyPage] = useState(1);
  const { data, loading, error } = useApiData<CampaignDetail>(`/api/campaigns/${source}/${jobId}`, {
    recipientPage,
    replyPage,
  });
  const j = data?.job;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-navy/30 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <aside className="fixed inset-y-0 z-50 flex w-full max-w-[560px] flex-col border-e border-border bg-surface shadow-pop" style={{ left: 0 }}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{j?.originalLabelName || j?.labelName || tr("كامبين", "Campaign")}</div>
            <div className="truncate text-xs text-muted-foreground">{j?.templateName || ""}</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground cursor-pointer" aria-label={tr("إغلاق", "Close")}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="flex justify-center p-8"><Spinner /></div>}
          {error && <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive-fg">{error}</div>}
          {j && (
            <>
              <div className="mb-3 rounded-lg border border-border bg-surface-2/40 p-3">
                <div className="text-2xs text-muted-foreground">{tr("منشئ الكامبين", "Created by")}</div>
                <div className="text-base font-bold text-primary">{j.operatorName || tr("غير معروف", "Unknown")}</div>
                <div className="mt-1 text-2xs text-muted-foreground">{formatDateTime(j.createdAtApp)} · {j.inboxName || ""}</div>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                <Stat label={tr("الإجمالي", "Total")} value={formatNumber(j.total)} />
                <Stat label={tr("مُرسل", "Sent")} value={formatNumber(j.sent)} tone="text-success-fg" />
                <Stat label={tr("فشل", "Failed")} value={formatNumber(j.failed)} tone="text-destructive-fg" />
                <Stat label={tr("متخطى", "Skipped")} value={formatNumber(j.skipped)} />
                <Stat label={tr("فشل تسليم", "Delivery failures")} value={formatNumber(j.deliveryFailuresCount)} tone="text-warning-fg" />
                <Stat label={tr("ردود", "Replies")} value={formatNumber(data?.replies.total ?? 0)} tone="text-primary" />
              </div>

              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{tr("المستلمون", "Recipients")} ({formatNumber(data?.recipients.total ?? 0)})</div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/50 text-2xs text-muted-foreground">
                      <th className="px-2 py-1.5 text-start">{tr("الاسم", "Name")}</th>
                      <th className="px-2 py-1.5 text-start">{tr("الهاتف", "Phone")}</th>
                      <th className="px-2 py-1.5 text-start">{tr("الحالة", "Status")}</th>
                      <th className="px-2 py-1.5 text-start">{tr("المحادثة", "Conversation")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.recipients.rows ?? []).map((r) => (
                      <tr key={r.id} className="border-b border-border/50 last:border-0">
                        <td className="px-2 py-1.5">{r.name || "—"}</td>
                        <td className="px-2 py-1.5 tnum ltr-nums">{r.phone || "—"}</td>
                        <td className="px-2 py-1.5">
                          <Badge tone={r.status === "sent" ? "success" : r.status === "failed" ? "danger" : "muted"}>{r.status}</Badge>
                        </td>
                        <td className="px-2 py-1.5">
                          {r.conversationCwId ? <Link href={`/conversations?conv=${r.conversationCwId}`} className="text-primary hover:underline">#{r.conversationCwId}</Link> : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data && data.recipients.pages > 1 && (
                <Pagination
                  page={data.recipients.page}
                  pages={data.recipients.pages}
                  total={data.recipients.total}
                  onPrevious={() => setRecipientPage((value) => Math.max(1, value - 1))}
                  onNext={() => setRecipientPage((value) => Math.min(data.recipients.pages, value + 1))}
                />
              )}

              {(data?.replies.total ?? 0) > 0 && (
                <>
                  <div className="mb-2 mt-4 text-xs font-semibold uppercase text-muted-foreground">{tr("الردود", "Replies")} ({formatNumber(data!.replies.total)})</div>
                  <div className="space-y-1">
                    {data!.replies.rows.map((rep, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-xs">
                        <Link href={`/conversations?conv=${rep.conversationCwId}`} className="text-primary hover:underline">#{rep.conversationCwId}</Link>
                        <span className="text-muted-foreground">{rep.assigneeName || (rep.assigned ? tr("مُسند", "Assigned") : tr("غير مُسند", "Unassigned"))}</span>
                        <span className="tnum">{formatDurationShort(rep.responseSeconds)}</span>
                      </div>
                    ))}
                  </div>
                  {data && data.replies.pages > 1 && (
                    <Pagination
                      page={data.replies.page}
                      pages={data.replies.pages}
                      total={data.replies.total}
                      onPrevious={() => setReplyPage((value) => Math.max(1, value - 1))}
                      onNext={() => setReplyPage((value) => Math.min(data.replies.pages, value + 1))}
                    />
                  )}
                </>
              )}

              <div className="mt-4 text-2xs text-muted-foreground">
                {tr("نسبة الرد", "Reply rate")}: {formatPercent(j.sent ? (data?.replies.total ?? 0) / j.sent : 0, 1)}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Pagination({
  page,
  pages,
  total,
  onPrevious,
  onNext,
}: {
  page: number;
  pages: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-2 flex min-h-11 items-center justify-between gap-2 text-xs">
      <button className="btn-ghost h-9 w-9 p-0" disabled={page <= 1} onClick={onPrevious} aria-label="Previous page">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="tnum text-muted-foreground">
        Page {formatNumber(page)} of {formatNumber(pages)} · {formatNumber(total)}
      </span>
      <button className="btn-ghost h-9 w-9 p-0" disabled={page >= pages} onClick={onNext} aria-label="Next page">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border p-2">
      <div className={cn("text-lg font-bold tnum", tone ?? "text-foreground")}>{value}</div>
      <div className="text-2xs text-muted-foreground">{label}</div>
    </div>
  );
}
