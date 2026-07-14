"use client";

import { X, ExternalLink } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import { Spinner, StatusPill, DepartmentPill, Badge, cn } from "@/components/ui";
import { formatDurationShort, formatDateTime } from "@/lib/format";

interface TimelineItem {
  at: string;
  kind: string;
  label: string;
  detail?: string | null;
}

interface ConversationDetail {
  conversation: {
    chatwootId: number;
    contactName: string | null;
    contactPhone: string | null;
    status: string | null;
    department: string | null;
    inboxName: string | null;
    teamName: string | null;
    assigneeName: string | null;
    responseSeconds: number | null;
    conversationDurationSeconds: number | null;
    assignedAt: string | null;
    firstHumanReplyAt: string | null;
    resolvedAt: string | null;
    createdAtCw: string | null;
    campaignLabel: string | null;
    botInvolved: boolean;
    needsReply: boolean;
  };
  timeline: TimelineItem[];
  link: string | null;
}

const KIND_COLOR: Record<string, string> = {
  created: "bg-muted-foreground",
  assigned: "bg-primary",
  customer: "bg-secondary",
  agent: "bg-success",
  bot: "bg-accent",
  automation: "bg-accent/60",
  template: "bg-warning",
  note: "bg-muted-foreground/60",
  resolved: "bg-success",
  reopened: "bg-warning",
  campaign: "bg-primary",
};

export function ConversationDrawer({ conversationId, onClose }: { conversationId: number; onClose: () => void }) {
  const { data, loading, error } = useApiData<ConversationDetail>(`/api/conversations/${conversationId}`);
  const c = data?.conversation;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-navy/30 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <aside className="fixed inset-y-0 z-50 flex w-full max-w-[480px] flex-col border-e border-border bg-surface shadow-pop" style={{ left: 0 }}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{c?.contactName || `محادثة #${conversationId}`}</div>
            <div className="truncate text-xs text-muted-foreground ltr-nums">{c?.contactPhone || ""}</div>
          </div>
          <div className="flex items-center gap-1">
            {data?.link && (
              <a href={data.link} target="_blank" rel="noreferrer" className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-primary" aria-label="فتح في Chatwoot">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button onClick={onClose} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground cursor-pointer" aria-label="إغلاق">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="flex justify-center p-8"><Spinner /></div>}
          {error && <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive-fg">{error}</div>}
          {c && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <StatusPill status={c.status} />
                <DepartmentPill department={c.department} />
                {c.campaignLabel && <Badge tone="primary">كامبين: {c.campaignLabel}</Badge>}
                {c.botInvolved && <Badge tone="warning">تدخل فهد</Badge>}
                {c.needsReply && <Badge tone="danger">يحتاج رد</Badge>}
              </div>

              <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
                <Meta label="الموظف" value={c.assigneeName} />
                <Meta label="الفريق" value={c.teamName} />
                <Meta label="القناة" value={c.inboxName} />
                <Meta label="زمن الرد" value={formatDurationShort(c.responseSeconds)} />
                <Meta label="مدة المحادثة" value={formatDurationShort(c.conversationDurationSeconds)} />
                <Meta label="وقت الإسناد" value={formatDateTime(c.assignedAt)} />
                <Meta label="أول رد بشري" value={formatDateTime(c.firstHumanReplyAt)} />
                <Meta label="وقت الحل" value={formatDateTime(c.resolvedAt)} />
              </dl>

              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">التسلسل الزمني</div>
              <ol className="relative space-y-3 border-s border-border ps-4">
                {data?.timeline.map((t, i) => (
                  <li key={i} className="relative">
                    <span className={cn("absolute h-2 w-2 rounded-full", KIND_COLOR[t.kind] ?? "bg-muted-foreground")} style={{ insetInlineStart: -21, top: 5 }} />
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{t.label}</span>
                      <span className="shrink-0 text-2xs text-muted-foreground">{formatDateTime(t.at)}</span>
                    </div>
                    {t.detail && <div className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">{t.detail}</div>}
                  </li>
                ))}
                {!data?.timeline.length && <li className="text-xs text-muted-foreground">لا توجد أحداث.</li>}
              </ol>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-2xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-medium">{value || "—"}</dd>
    </div>
  );
}
