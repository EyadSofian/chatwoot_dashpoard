"use client";

import { useEffect, useState } from "react";
import { Check, CheckCircle2, XCircle, Copy, RefreshCw, Database, Megaphone } from "lucide-react";
import { useApiData, apiPost } from "@/lib/client/api";
import type { SlaSettings } from "@/lib/settings";
import { Card, CardTitle, Spinner, Badge } from "@/components/ui";
import { useLocale } from "@/lib/i18n";

interface Health {
  config: { chatwoot: boolean; database: boolean; campaignSales: boolean; campaignOperations: boolean; webhookSecret: boolean };
}

export default function SettingsPage() {
  const { tr } = useLocale();
  const { data: health } = useApiData<Health>("/api/health");
  const [webhookUrl, setWebhookUrl] = useState("");

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/webhooks/chatwoot`);
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ConfigStatus health={health} />
      <ChatwootTest />
      <CampaignTest />
      <WebhookCard url={webhookUrl} hasSecret={health?.config.webhookSecret ?? false} />
      <MetadataSyncCard />
      <BackfillCard />
      <SlaForm />
    </div>
  );
}

interface MetadataState {
  synced: boolean;
  lastSyncAt: string | null;
  agents: number;
  teams: number;
}

/**
 * Chatwoot metadata (agents, teams + their members, inboxes). The rosters live
 * here — without this sync the Agents and Teams screens have nothing to list,
 * however much conversation history has been backfilled.
 */
function MetadataSyncCard() {
  const { tr } = useLocale();
  const { data, reload } = useApiData<MetadataState>("/api/sync/metadata");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sync = async (label: string, body: Record<string, boolean>) => {
    setBusy(label);
    setError(null);
    setResult(null);
    try {
      const res = await apiPost<{ state: { agents: number; teams: number; inboxes: number; memberships: number; labels: number } }>(
        "/api/sync/metadata",
        body,
      );
      const s = res.state;
      setResult(`${s.agents} ${tr("موظف","agents")} · ${s.teams} ${tr("تيم","teams")} · ${s.memberships} ${tr("عضوية","memberships")} · ${s.inboxes} ${tr("قناة","inboxes")} · ${s.labels} ${tr("تصنيف","labels")}`);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const buttons: { label: string; body: Record<string, boolean> }[] = [
    { label: "Sync Agents", body: { agents: true } },
    { label: "Sync Teams", body: { teams: true } },
    { label: "Sync Inboxes", body: { inboxes: true } },
    { label: "Sync Labels", body: { labels: true } },
  ];

  return (
    <Card>
      <CardTitle
        action={
          <button
            onClick={() => sync("all", {})}
            disabled={busy !== null}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            {busy === "all" ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />} Sync All
          </button>
        }
      >
        {tr("بيانات Chatwoot (الموظفون والتيمات)", "Chatwoot metadata (agents & teams)")}
      </CardTitle>

      {data && !data.synced && (
        <div className="mb-3 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-xs font-semibold text-warning-fg">
          {tr("لم تُنفَّذ بعد. لن يظهر الموظفون والتيمات قبلها.", "Not run yet. Agents and teams will not appear until it runs.")}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {buttons.map((b) => (
          <button
            key={b.label}
            onClick={() => sync(b.label, b.body)}
            disabled={busy !== null}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            {busy === b.label ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />} {b.label}
          </button>
        ))}
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-surface-2 p-2.5">
          <dd className="text-lg font-bold tnum">{data?.agents ?? "—"}</dd>
          <dt className="text-2xs text-muted-foreground">{tr("موظفون", "Agents")}</dt>
        </div>
        <div className="rounded-xl bg-surface-2 p-2.5">
          <dd className="text-lg font-bold tnum">{data?.teams ?? "—"}</dd>
          <dt className="text-2xs text-muted-foreground">{tr("تيمات", "Teams")}</dt>
        </div>
        <div className="rounded-xl bg-surface-2 p-2.5">
          <dd className="text-xs font-bold">
            {data?.lastSyncAt ? new Date(data.lastSyncAt).toLocaleString("ar-EG") : "—"}
          </dd>
          <dt className="text-2xs text-muted-foreground">{tr("آخر Sync", "Last sync")}</dt>
        </div>
      </dl>

      {result && <p className="mt-2 text-xs font-semibold text-success-fg">{tr("تم", "Done")}: {result}</p>}
      {error && <p className="mt-2 text-xs font-semibold text-destructive-fg">{error}</p>}
      <p className="mt-2 text-2xs text-muted-foreground">
        {tr("يُشغِّلها Backfill تلقائيًا في البداية.", "Backfill runs it automatically at the start.")}
      </p>
    </Card>
  );
}

function ConfigStatus({ health }: { health: Health | null }) {
  const { tr } = useLocale();
  const items = [
    { label: tr("قاعدة البيانات", "Database"), ok: health?.config.database },
    { label: tr("اتصال Chatwoot", "Chatwoot connection"), ok: health?.config.chatwoot },
    { label: tr("سر الويبهوك", "Webhook secret"), ok: health?.config.webhookSecret },
    { label: tr("تطبيق كامبين المبيعات", "Sales campaign app"), ok: health?.config.campaignSales },
    { label: tr("تطبيق كامبين العمليات", "Operations campaign app"), ok: health?.config.campaignOperations },
  ];
  return (
    <Card>
      <CardTitle>{tr("حالة الإعدادات", "Configuration status")}</CardTitle>
      <ul className="space-y-2 text-sm">
        {items.map((i) => (
          <li key={i.label} className="flex items-center justify-between">
            <span>{i.label}</span>
            {i.ok ? (
              <span className="inline-flex items-center gap-1 text-success-fg"><CheckCircle2 className="h-4 w-4" /> {tr("مضبوط", "Configured")}</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground"><XCircle className="h-4 w-4" /> {tr("غير مضبوط", "Not configured")}</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ChatwootTest() {
  const { tr } = useLocale();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; agents?: number; inboxes?: number; teams?: number; error?: string; baseUrl?: string } | null>(null);
  const run = async () => {
    setLoading(true);
    try {
      setResult(await apiPost("/api/settings/test-chatwoot"));
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card>
      <CardTitle action={<button onClick={run} disabled={loading} className="btn-ghost text-xs">{loading ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />} {tr("اختبار", "Test")}</button>}>
        {tr("الاتصال بـ Chatwoot", "Chatwoot connection")}
      </CardTitle>
      {result ? (
        result.ok !== false ? (
          <div className="space-y-1 text-sm">
            <div className="text-xs text-muted-foreground">{result.baseUrl}</div>
            <div className="flex gap-3">
              <Badge tone="primary">{result.agents ?? 0} {tr("موظف", "agents")}</Badge>
              <Badge tone="primary">{result.inboxes ?? 0} {tr("قناة", "inboxes")}</Badge>
              <Badge tone="primary">{result.teams ?? 0} {tr("فريق", "teams")}</Badge>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive-fg">{result.error}</div>
        )
      ) : (
        <p className="text-xs text-muted-foreground">{tr("اضغط اختبار للتحقق من الاتصال باستخدام متغيرات البيئة.", "Click Test to verify the connection using the environment variables.")}</p>
      )}
    </Card>
  );
}

function CampaignTest() {
  const { tr } = useLocale();
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<Array<{ key: string; name: string; ok: boolean; jobs: number; error?: string }> | null>(null);
  const run = async () => {
    setLoading(true);
    try {
      const res = await apiPost<{ sources: typeof sources }>("/api/settings/test-campaigns");
      setSources(res.sources);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card>
      <CardTitle action={<button onClick={run} disabled={loading} className="btn-ghost text-xs">{loading ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />} اختبار</button>}>
        تطبيقات الكامبين
      </CardTitle>
      {sources ? (
        sources.length ? (
          <ul className="space-y-2 text-sm">
            {sources.map((s) => (
              <li key={s.key} className="flex items-center justify-between">
                <span>{s.name}</span>
                {s.ok ? <Badge tone="success">{s.jobs} مهمة</Badge> : <Badge tone="danger">{tr("فشل", "Failed")}</Badge>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">{tr("لم يتم ضبط روابط تطبيقات الكامبين.", "Campaign app URLs are not configured.")}</p>
        )
      ) : (
        <p className="text-xs text-muted-foreground">{tr("اختبر الاتصال بتطبيقي رفع الكامبينات.", "Test the connection to the two campaign uploader apps.")}</p>
      )}
    </Card>
  );
}

function WebhookCard({ url, hasSecret }: { url: string; hasSecret: boolean }) {
  const { tr } = useLocale();
  const [copied, setCopied] = useState(false);
  const full = hasSecret ? `${url}?token=<WEBHOOK_SECRET>` : url;
  return (
    <Card>
      <CardTitle>{tr("رابط الويبهوك", "Webhook URL")}</CardTitle>
      <p className="mb-2 text-xs text-muted-foreground">{tr("أضِف هذا الرابط في Chatwoot ← الإعدادات ← Integrations ← Webhooks، واشترك في أحداث الرسائل والمحادثات.", "Add this URL in Chatwoot → Settings → Integrations → Webhooks, and subscribe to message and conversation events.")}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs ltr-nums" dir="ltr">{full}</code>
        <button
          onClick={() => { navigator.clipboard?.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="btn-ghost text-xs"
        >
          <Copy className="h-3.5 w-3.5" /> {copied ? "تم" : "نسخ"}
        </button>
      </div>
    </Card>
  );
}

function BackfillCard() {
  const { tr } = useLocale();
  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const backfill = async (days: number) => {
    setLoading(`b${days}`);
    setMsg(null);
    try {
      const res = await apiPost<{ stats: { conversationsProcessed: number; conversationsFailed: number } }>("/api/backfill", { days });
      setMsg(`${tr("تم جلب","Fetched")} ${res.stats.conversationsProcessed} (${res.stats.conversationsFailed} ${tr("فشل","failed")})`);
    } catch (e) {
      setMsg(`${tr("خطأ","Error")}: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };
  const syncCampaigns = async () => {
    setLoading("camp");
    setMsg(null);
    try {
      const res = await apiPost<{ stats: { jobs: number; recipients: number } }>("/api/sync/campaigns");
      setMsg(`${tr("تمت مزامنة","Synced")} ${res.stats.jobs} ${tr("كامبين","campaigns")}, ${res.stats.recipients} ${tr("مستلم","recipients")}`);
    } catch (e) {
      setMsg(`${tr("خطأ","Error")}: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card>
      <CardTitle>{tr("جلب البيانات", "Fetch data")}</CardTitle>
      <div className="mb-3 flex flex-wrap gap-2">
        {[7, 30, 60, 90].map((d) => (
          <button key={d} onClick={() => backfill(d)} disabled={loading !== null} className="btn-ghost text-xs">
            {loading === `b${d}` ? <Spinner /> : <Database className="h-3.5 w-3.5" />} {tr("آخر","Last")} {d} {tr("يوم","days")}
          </button>
        ))}
      </div>
      <button onClick={syncCampaigns} disabled={loading !== null} className="btn-primary text-xs">
        {loading === "camp" ? <Spinner /> : <Megaphone className="h-3.5 w-3.5" />} مزامنة الكامبينات
      </button>
      {msg && <div className="mt-3 rounded-lg bg-surface-2 p-2 text-xs">{msg}</div>}
      <p className="mt-2 text-2xs text-muted-foreground">{tr("الـ Backfill يجلب المحادثات والرسائل ويعيد حساب المؤشرات. قد يستغرق دقائق للفترات الطويلة.", "Backfill fetches conversations and messages and recomputes the metrics. It can take minutes for long periods.")}</p>
    </Card>
  );
}

function SlaForm() {
  const { tr } = useLocale();
  const { data } = useApiData<SlaSettings>("/api/settings/sla");
  const [form, setForm] = useState<SlaSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (!form) return <Card><CardTitle>{tr("إعدادات SLA", "SLA settings")}</CardTitle><Spinner /></Card>;

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await apiPost("/api/settings/sla", form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const days = [tr("الأحد","Sun"), tr("الإثنين","Mon"), tr("الثلاثاء","Tue"), tr("الأربعاء","Wed"), tr("الخميس","Thu"), tr("الجمعة","Fri"), tr("السبت","Sat")];

  return (
    <Card className="lg:col-span-2">
      <CardTitle action={<button onClick={save} disabled={saving} className="btn-primary text-xs">{saving ? <Spinner /> : null} {tr("حفظ", "Save")} {saved ? <Check className="h-3.5 w-3.5" /> : null}</button>}>
        {tr("إعدادات SLA وساعات العمل", "SLA & business hours")}
      </CardTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={tr("هدف الرد الأول (دقيقة)", "First-response target (min)")}>
          <input type="number" min={1} value={form.firstResponseMinutes} onChange={(e) => setForm({ ...form, firstResponseMinutes: Number(e.target.value) })} className="input" />
        </Field>
        <Field label={tr("هدف الحل (ساعة)", "Resolution target (hours)")}>
          <input type="number" min={1} value={form.resolutionHours} onChange={(e) => setForm({ ...form, resolutionHours: Number(e.target.value) })} className="input" />
        </Field>
        <Field label={tr("المنطقة الزمنية", "Timezone")}>
          <input value={form.businessHours.timezone} onChange={(e) => setForm({ ...form, businessHours: { ...form.businessHours, timezone: e.target.value } })} className="input" />
        </Field>
        <Field label={tr("بداية / نهاية العمل", "Work start / end")}>
          <div className="flex gap-2">
            <input type="time" value={form.businessHours.start} onChange={(e) => setForm({ ...form, businessHours: { ...form.businessHours, start: e.target.value } })} className="input" />
            <input type="time" value={form.businessHours.end} onChange={(e) => setForm({ ...form, businessHours: { ...form.businessHours, end: e.target.value } })} className="input" />
          </div>
        </Field>
      </div>
      <div className="mt-3">
        <div className="mb-1.5 text-2xs text-muted-foreground">{tr("أيام العمل", "Working days")}</div>
        <div className="flex flex-wrap gap-1.5">
          {days.map((d, idx) => {
            const active = form.businessHours.days.includes(idx);
            return (
              <button
                key={idx}
                onClick={() => {
                  const set = new Set(form.businessHours.days);
                  if (set.has(idx)) set.delete(idx);
                  else set.add(idx);
                  setForm({ ...form, businessHours: { ...form.businessHours, days: [...set].sort() } });
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs cursor-pointer ${active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-2xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
