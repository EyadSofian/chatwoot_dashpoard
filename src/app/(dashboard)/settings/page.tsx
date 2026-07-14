"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Copy, RefreshCw, Database, Megaphone } from "lucide-react";
import { useApiData, apiPost } from "@/lib/client/api";
import type { SlaSettings } from "@/lib/settings";
import { Card, CardTitle, Spinner, Badge } from "@/components/ui";

interface Health {
  config: { chatwoot: boolean; database: boolean; campaignSales: boolean; campaignOperations: boolean; webhookSecret: boolean };
}

export default function SettingsPage() {
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
      <BackfillCard />
      <SlaForm />
    </div>
  );
}

function ConfigStatus({ health }: { health: Health | null }) {
  const items = [
    { label: "قاعدة البيانات", ok: health?.config.database },
    { label: "اتصال Chatwoot", ok: health?.config.chatwoot },
    { label: "سر الويبهوك", ok: health?.config.webhookSecret },
    { label: "تطبيق كامبين المبيعات", ok: health?.config.campaignSales },
    { label: "تطبيق كامبين العمليات", ok: health?.config.campaignOperations },
  ];
  return (
    <Card>
      <CardTitle>حالة الإعدادات</CardTitle>
      <ul className="space-y-2 text-sm">
        {items.map((i) => (
          <li key={i.label} className="flex items-center justify-between">
            <span>{i.label}</span>
            {i.ok ? (
              <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" /> مضبوط</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground"><XCircle className="h-4 w-4" /> غير مضبوط</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ChatwootTest() {
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
      <CardTitle action={<button onClick={run} disabled={loading} className="btn-ghost text-xs">{loading ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />} اختبار</button>}>
        الاتصال بـ Chatwoot
      </CardTitle>
      {result ? (
        result.ok !== false ? (
          <div className="space-y-1 text-sm">
            <div className="text-xs text-muted-foreground">{result.baseUrl}</div>
            <div className="flex gap-3">
              <Badge tone="primary">{result.agents ?? 0} موظف</Badge>
              <Badge tone="primary">{result.inboxes ?? 0} قناة</Badge>
              <Badge tone="primary">{result.teams ?? 0} فريق</Badge>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">{result.error}</div>
        )
      ) : (
        <p className="text-xs text-muted-foreground">اضغط اختبار للتحقق من الاتصال باستخدام متغيرات البيئة.</p>
      )}
    </Card>
  );
}

function CampaignTest() {
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
                {s.ok ? <Badge tone="success">{s.jobs} مهمة</Badge> : <Badge tone="danger">فشل</Badge>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">لم يتم ضبط روابط تطبيقات الكامبين.</p>
        )
      ) : (
        <p className="text-xs text-muted-foreground">اختبر الاتصال بتطبيقي رفع الكامبينات.</p>
      )}
    </Card>
  );
}

function WebhookCard({ url, hasSecret }: { url: string; hasSecret: boolean }) {
  const [copied, setCopied] = useState(false);
  const full = hasSecret ? `${url}?token=<WEBHOOK_SECRET>` : url;
  return (
    <Card>
      <CardTitle>رابط الويبهوك</CardTitle>
      <p className="mb-2 text-xs text-muted-foreground">أضِف هذا الرابط في Chatwoot ← الإعدادات ← Integrations ← Webhooks، واشترك في أحداث الرسائل والمحادثات.</p>
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
  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const backfill = async (days: number) => {
    setLoading(`b${days}`);
    setMsg(null);
    try {
      const res = await apiPost<{ stats: { conversationsProcessed: number; conversationsFailed: number } }>("/api/backfill", { days });
      setMsg(`تم جلب ${res.stats.conversationsProcessed} محادثة (${res.stats.conversationsFailed} فشل).`);
    } catch (e) {
      setMsg(`خطأ: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };
  const syncCampaigns = async () => {
    setLoading("camp");
    setMsg(null);
    try {
      const res = await apiPost<{ stats: { jobs: number; recipients: number } }>("/api/sync/campaigns");
      setMsg(`تمت مزامنة ${res.stats.jobs} كامبين و ${res.stats.recipients} مستلم.`);
    } catch (e) {
      setMsg(`خطأ: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card>
      <CardTitle>جلب البيانات</CardTitle>
      <div className="mb-3 flex flex-wrap gap-2">
        {[7, 30, 60, 90].map((d) => (
          <button key={d} onClick={() => backfill(d)} disabled={loading !== null} className="btn-ghost text-xs">
            {loading === `b${d}` ? <Spinner /> : <Database className="h-3.5 w-3.5" />} آخر {d} يوم
          </button>
        ))}
      </div>
      <button onClick={syncCampaigns} disabled={loading !== null} className="btn-primary text-xs">
        {loading === "camp" ? <Spinner /> : <Megaphone className="h-3.5 w-3.5" />} مزامنة الكامبينات
      </button>
      {msg && <div className="mt-3 rounded-lg bg-surface-2 p-2 text-xs">{msg}</div>}
      <p className="mt-2 text-2xs text-muted-foreground">الـ Backfill يجلب المحادثات والرسائل ويعيد حساب المؤشرات. قد يستغرق دقائق للفترات الطويلة.</p>
    </Card>
  );
}

function SlaForm() {
  const { data } = useApiData<SlaSettings>("/api/settings/sla");
  const [form, setForm] = useState<SlaSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (!form) return <Card><CardTitle>إعدادات SLA</CardTitle><Spinner /></Card>;

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

  const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

  return (
    <Card className="lg:col-span-2">
      <CardTitle action={<button onClick={save} disabled={saving} className="btn-primary text-xs">{saving ? <Spinner /> : null} حفظ {saved && "✓"}</button>}>
        إعدادات SLA وساعات العمل
      </CardTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="هدف الرد الأول (دقيقة)">
          <input type="number" min={1} value={form.firstResponseMinutes} onChange={(e) => setForm({ ...form, firstResponseMinutes: Number(e.target.value) })} className="input" />
        </Field>
        <Field label="هدف الحل (ساعة)">
          <input type="number" min={1} value={form.resolutionHours} onChange={(e) => setForm({ ...form, resolutionHours: Number(e.target.value) })} className="input" />
        </Field>
        <Field label="المنطقة الزمنية">
          <input value={form.businessHours.timezone} onChange={(e) => setForm({ ...form, businessHours: { ...form.businessHours, timezone: e.target.value } })} className="input" />
        </Field>
        <Field label="بداية / نهاية العمل">
          <div className="flex gap-2">
            <input type="time" value={form.businessHours.start} onChange={(e) => setForm({ ...form, businessHours: { ...form.businessHours, start: e.target.value } })} className="input" />
            <input type="time" value={form.businessHours.end} onChange={(e) => setForm({ ...form, businessHours: { ...form.businessHours, end: e.target.value } })} className="input" />
          </div>
        </Field>
      </div>
      <div className="mt-3">
        <div className="mb-1.5 text-2xs text-muted-foreground">أيام العمل</div>
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
