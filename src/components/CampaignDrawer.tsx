"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import { Spinner, Badge, cn } from "@/components/ui";
import { formatDurationShort, formatNumber, formatDateTime, formatPercent } from "@/lib/format";

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
  recipients: Array<{ id: string; phone: string | null; name: string | null; status: string | null; conversationCwId: number | null; errorDescription: string | null }>;
  replies: Array<{ conversationCwId: number; assigned: boolean; assigneeName: string | null; responseSeconds: number | null }>;
}

export function CampaignDrawer({ source, jobId, onClose }: { source: string; jobId: string; onClose: () => void }) {
  const { data, loading, error } = useApiData<CampaignDetail>(`/api/campaigns/${source}/${jobId}`);
  const j = data?.job;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} aria-hidden />
      <aside className="fixed inset-y-0 z-50 flex w-full max-w-[560px] flex-col border-e border-border bg-surface shadow-pop" style={{ left: 0 }}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{j?.originalLabelName || j?.labelName || "كامبين"}</div>
            <div className="truncate text-xs text-muted-foreground">{j?.templateName || ""}</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground cursor-pointer" aria-label="إغلاق">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="flex justify-center p-8"><Spinner /></div>}
          {error && <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
          {j && (
            <>
              <div className="mb-3 rounded-lg border border-border bg-surface-2/40 p-3">
                <div className="text-2xs text-muted-foreground">مين عمل الكامبين</div>
                <div className="text-base font-bold text-primary">{j.operatorName || "غير معروف"}</div>
                <div className="mt-1 text-2xs text-muted-foreground">{formatDateTime(j.createdAtApp)} · {j.inboxName || ""}</div>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                <Stat label="الإجمالي" value={formatNumber(j.total)} />
                <Stat label="مُرسل" value={formatNumber(j.sent)} tone="text-success" />
                <Stat label="فشل" value={formatNumber(j.failed)} tone="text-destructive" />
                <Stat label="متخطى" value={formatNumber(j.skipped)} />
                <Stat label="فشل تسليم" value={formatNumber(j.deliveryFailuresCount)} tone="text-warning" />
                <Stat label="ردود" value={formatNumber(data?.replies.length ?? 0)} tone="text-primary" />
              </div>

              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">المستلمون ({formatNumber(data?.recipients.length ?? 0)})</div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/50 text-2xs text-muted-foreground">
                      <th className="px-2 py-1.5 text-start">الاسم</th>
                      <th className="px-2 py-1.5 text-start">الهاتف</th>
                      <th className="px-2 py-1.5 text-start">الحالة</th>
                      <th className="px-2 py-1.5 text-start">المحادثة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.recipients ?? []).slice(0, 300).map((r) => (
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

              {(data?.replies.length ?? 0) > 0 && (
                <>
                  <div className="mb-2 mt-4 text-xs font-semibold uppercase text-muted-foreground">الردود ({formatNumber(data!.replies.length)})</div>
                  <div className="space-y-1">
                    {data!.replies.slice(0, 100).map((rep, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-xs">
                        <Link href={`/conversations?conv=${rep.conversationCwId}`} className="text-primary hover:underline">#{rep.conversationCwId}</Link>
                        <span className="text-muted-foreground">{rep.assigneeName || (rep.assigned ? "مُسند" : "غير مُسند")}</span>
                        <span className="tnum">{formatDurationShort(rep.responseSeconds)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="mt-4 text-2xs text-muted-foreground">
                نسبة الرد: {formatPercent(j.sent ? (data?.replies.length ?? 0) / j.sent : 0, 1)}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
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
