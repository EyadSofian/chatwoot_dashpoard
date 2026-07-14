"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import { useApiData, apiPost } from "@/lib/client/api";
import type { AgentAuditRow, AuditFreshness } from "@/lib/audit/workload";
import {
  Badge,
  Card,
  CardTitle,
  cn,
  ErrorState,
  LoadingBlock,
  Section,
  SkeletonCards,
  Spinner,
  StatTile,
} from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { formatDateTime, formatNumber } from "@/lib/format";

interface AuditResult {
  rows: AgentAuditRow[];
  freshness: AuditFreshness;
}

interface AuditEntry {
  chatwootId: number;
  chatwootStatus: string | null;
  dashboardStatus: string | null;
  dashboardAssigneeCwId: number | null;
  reason: string;
  explanation: string;
}

interface AgentAuditDetail {
  totals: { chatwootActive: number; dashboardActive: number; difference: number };
  countedAsWorkload: AuditEntry[];
  missingInDashboard: AuditEntry[];
  notAssignedInChatwoot: AuditEntry[];
  periodAssignment: { uniqueConversations: number; events: number; responses: number; conversationIds: number[] };
}

function IdList({ ids }: { ids: number[] }) {
  if (!ids.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {ids.slice(0, 40).map((id) => (
        <span key={id} className="rounded-md bg-muted px-1.5 py-0.5 text-2xs font-semibold tnum">
          #{id}
        </span>
      ))}
      {ids.length > 40 && <span className="text-2xs text-muted-foreground">+{ids.length - 40}</span>}
    </div>
  );
}

function Bucket({
  title,
  tone,
  entries,
}: {
  title: string;
  tone: "danger" | "warning" | "success";
  entries: AuditEntry[];
}) {
  return (
    <div className="rounded-card border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h4 className="text-sm font-bold">{title}</h4>
        <Badge tone={tone}>{formatNumber(entries.length)}</Badge>
      </div>
      {entries.length === 0 ? (
        <p className="p-4 text-xs text-muted-foreground">لا توجد عناصر.</p>
      ) : (
        <ul className="divide-y divide-border">
          {entries.slice(0, 60).map((e) => (
            <li key={e.chatwootId} className="px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-2xs font-bold tnum">#{e.chatwootId}</span>
                {e.chatwootStatus && <Badge tone="muted">Chatwoot: {e.chatwootStatus}</Badge>}
                {e.dashboardStatus && <Badge tone="muted">DB: {e.dashboardStatus}</Badge>}
              </div>
              {/* The reason is the whole point — never just the count. */}
              <p className="mt-1 text-xs text-muted-foreground">{e.explanation}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AuditPage() {
  const { data, loading, error, reload } = useApiData<AuditResult>("/api/audit/agents");
  const [selected, setSelected] = useState<number | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);

  const { data: detail, loading: detailLoading } = useApiData<AgentAuditDetail>(
    selected !== null ? `/api/audit/agents/${selected}` : "/api/health",
  );

  const f = data?.freshness;

  const reconcile = async () => {
    setReconciling(true);
    setReconcileResult(null);
    try {
      const res = await apiPost<{ stats: { mismatched: number; reIngested: number; failed: number } }>(
        "/api/audit/reconcile-current-workload",
        {},
      );
      setReconcileResult(
        `تمت إعادة استيراد ${formatNumber(res.stats.reIngested)} محادثة من أصل ${formatNumber(res.stats.mismatched)} غير مطابِقة${res.stats.failed ? ` · فشل ${formatNumber(res.stats.failed)}` : ""}`,
      );
      reload();
    } catch (err) {
      setReconcileResult((err as Error).message);
    } finally {
      setReconciling(false);
    }
  };

  const columns: Column<AgentAuditRow>[] = [
    { key: "name", header: "الموظف", render: (r) => <span className="font-semibold">{r.name}</span> },
    {
      key: "chatwootActive",
      header: "Chatwoot (نشط)",
      align: "end",
      render: (r) => (
        <div className="tnum">
          <span className="font-bold">{formatNumber(r.chatwootActive)}</span>
          <div className="text-2xs text-muted-foreground">
            {r.chatwootOpen}/{r.chatwootPending}/{r.chatwootSnoozed}
          </div>
        </div>
      ),
    },
    {
      key: "dashboardActive",
      header: "الداشبورد (نشط)",
      align: "end",
      render: (r) => (
        <div className="tnum">
          <span className="font-bold">{formatNumber(r.dashboardActive)}</span>
          <div className="text-2xs text-muted-foreground">
            {r.dashboardOpen}/{r.dashboardPending}/{r.dashboardSnoozed}
          </div>
        </div>
      ),
    },
    {
      key: "difference",
      header: "الفرق",
      align: "end",
      render: (r) =>
        r.difference === 0 ? (
          <Badge tone="success">مطابِق</Badge>
        ) : (
          <Badge tone="danger">{r.difference > 0 ? `+${r.difference}` : r.difference}</Badge>
        ),
    },
    { key: "assignedInPeriod", header: "أُسندت في الفترة", align: "end", render: (r) => <span className="tnum">{formatNumber(r.assignedInPeriod)}</span> },
    { key: "assignmentEvents", header: "أحداث الإسناد", align: "end", render: (r) => <span className="tnum">{formatNumber(r.assignmentEvents)}</span> },
    { key: "firstResponsesInPeriod", header: "ردود أولى", align: "end", render: (r) => <span className="tnum">{formatNumber(r.firstResponsesInPeriod)}</span> },
    { key: "createdInPeriod", header: "أُنشئت في الفترة", align: "end", render: (r) => <span className="tnum">{formatNumber(r.createdInPeriod)}</span> },
    { key: "resolvedInPeriod", header: "أُغلقت في الفترة", align: "end", render: (r) => <span className="tnum">{formatNumber(r.resolvedInPeriod)}</span> },
    { key: "needsReplyNow", header: "تحتاج رد الآن", align: "end", render: (r) => <span className="tnum">{formatNumber(r.needsReplyNow)}</span> },
  ];

  return (
    <div className="space-y-5">
      {loading && !data ? (
        <SkeletonCards count={4} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="محادثات مفحوصة من Chatwoot"
            value={formatNumber(f?.scanned ?? 0)}
            icon={<ShieldCheck className="h-[18px] w-[18px]" />}
            tone="brand"
          />
          <StatTile
            label="موظفون غير مطابِقين"
            value={formatNumber(f?.mismatchedAgents ?? 0)}
            icon={<AlertTriangle className="h-[18px] w-[18px]" />}
            tone={f?.mismatchedAgents ? "danger" : "success"}
          />
          <StatTile
            label="محادثات غير مطابِقة"
            value={formatNumber(f?.mismatchedConversations ?? 0)}
            icon={<AlertTriangle className="h-[18px] w-[18px]" />}
            tone={f?.mismatchedConversations ? "danger" : "success"}
          />
          <StatTile
            label="آخر استيراد"
            value={f?.lastIngestAt ? formatDateTime(f.lastIngestAt) : "—"}
            icon={<RefreshCw className="h-[18px] w-[18px]" />}
            tone={f?.stale ? "warning" : "neutral"}
          />
        </div>
      )}

      {f?.stale && (
        <div className="flex items-center gap-3 rounded-card border border-warning/30 bg-warning/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning-fg" aria-hidden />
          <p className="text-sm font-semibold text-warning-fg">
            بيانات الداشبورد قديمة — آخر استيراد مضى عليه أكثر من ساعة بينما Chatwoot به محادثات نشطة.
          </p>
        </div>
      )}

      {f?.truncated && (
        <div className="flex items-center gap-3 rounded-card border border-border bg-muted px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-xs text-muted-foreground">
            لقطة Chatwoot غير مكتملة — تم بلوغ حد الصفحات. زد `maxPages` لفحص كامل.
          </p>
        </div>
      )}

      <Card>
        <CardTitle
          hint={
            f
              ? `لقطة Chatwoot: ${formatDateTime(f.chatwootSnapshotAt)} · ${formatNumber(f.pages)} صفحة`
              : undefined
          }
          action={
            <button onClick={reconcile} disabled={reconciling} className="btn-primary px-3 py-1.5 text-xs">
              {reconciling ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />} إعادة مطابقة الحمل الحالي
            </button>
          }
        >
          مطابقة الحمل الحالي
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          يقارن الحالات النشطة (open / pending / snoozed) في Chatwoot بما هو مخزَّن. القراءة فقط من Chatwoot؛ إعادة
          المطابقة تكتب في قاعدة التحليلات وحدها.
        </p>
        {reconcileResult && (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-success-fg">
            <CheckCircle2 className="h-3.5 w-3.5" /> {reconcileResult}
          </p>
        )}
      </Card>

      <Section title="التدقيق لكل موظف" hint="اضغط على صف لعرض أرقام المحادثات وسبب كل استبعاد">
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} />
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <DataTable
                columns={columns}
                rows={data?.rows ?? []}
                getKey={(r) => r.agentId}
                onRowClick={(r) => setSelected(r.agentId)}
                emptyTitle="لا توجد بيانات للتدقيق"
              />
            </div>

            <ul className="space-y-3 p-4 lg:hidden">
              {(data?.rows ?? []).map((r) => (
                <li key={r.agentId}>
                  <button
                    onClick={() => setSelected(r.agentId)}
                    className="w-full cursor-pointer rounded-card border border-border p-4 text-start"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-bold">{r.name}</span>
                      {r.difference === 0 ? (
                        <Badge tone="success">مطابِق</Badge>
                      ) : (
                        <Badge tone="danger">{r.difference > 0 ? `+${r.difference}` : r.difference}</Badge>
                      )}
                    </div>
                    <dl className="mt-3 grid grid-cols-3 divide-x divide-border rounded-xl border border-border">
                      <div className="px-2 py-2 text-center">
                        <dd className="text-sm font-bold tnum">{formatNumber(r.chatwootActive)}</dd>
                        <dt className="text-2xs text-muted-foreground">Chatwoot</dt>
                      </div>
                      <div className="px-2 py-2 text-center">
                        <dd className="text-sm font-bold tnum">{formatNumber(r.dashboardActive)}</dd>
                        <dt className="text-2xs text-muted-foreground">الداشبورد</dt>
                      </div>
                      <div className="px-2 py-2 text-center">
                        <dd className="text-sm font-bold tnum">{formatNumber(r.assignedInPeriod)}</dd>
                        <dt className="text-2xs text-muted-foreground">أُسندت</dt>
                      </div>
                    </dl>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {selected !== null && (
        <Section
          title={`تفاصيل التدقيق — ${data?.rows.find((r) => r.agentId === selected)?.name ?? `#${selected}`}`}
          hint="كل رقم محادثة، وسبب احتسابه أو استبعاده"
          action={
            <button onClick={() => setSelected(null)} className="btn-ghost rounded-full px-3 py-1.5 text-xs">
              إغلاق
            </button>
          }
        >
          {detailLoading || !detail ? (
            <LoadingBlock />
          ) : (
            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-surface-2 p-3 text-center">
                  <div className="text-lg font-bold tnum">{formatNumber(detail.totals.chatwootActive)}</div>
                  <div className="text-2xs text-muted-foreground">Chatwoot نشط</div>
                </div>
                <div className="rounded-xl bg-surface-2 p-3 text-center">
                  <div className="text-lg font-bold tnum">{formatNumber(detail.totals.dashboardActive)}</div>
                  <div className="text-2xs text-muted-foreground">الداشبورد نشط</div>
                </div>
                <div className="rounded-xl bg-surface-2 p-3 text-center">
                  <div
                    className={cn(
                      "text-lg font-bold tnum",
                      detail.totals.difference === 0 ? "text-success-fg" : "text-destructive-fg",
                    )}
                  >
                    {detail.totals.difference > 0 ? `+${detail.totals.difference}` : detail.totals.difference}
                  </div>
                  <div className="text-2xs text-muted-foreground">الفرق</div>
                </div>
              </div>

              <Bucket
                title="موجودة في Chatwoot وغير محسوبة في الداشبورد"
                tone="danger"
                entries={detail.missingInDashboard}
              />
              <Bucket
                title="محسوبة في الداشبورد وغير مُسندة حاليًا في Chatwoot"
                tone="warning"
                entries={detail.notAssignedInChatwoot}
              />
              <Bucket title="محسوبة ضمن الحمل الحالي" tone="success" entries={detail.countedAsWorkload} />

              <div className="rounded-card border border-border p-4">
                <h4 className="mb-2 text-sm font-bold">نشاط الإسناد خلال الفترة</h4>
                <p className="mb-2 text-xs text-muted-foreground">
                  {formatNumber(detail.periodAssignment.uniqueConversations)} محادثة فريدة ·{" "}
                  {formatNumber(detail.periodAssignment.events)} حدث إسناد ·{" "}
                  {formatNumber(detail.periodAssignment.responses)} رد أول
                </p>
                <IdList ids={detail.periodAssignment.conversationIds} />
              </div>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
