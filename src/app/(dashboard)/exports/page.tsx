"use client";

import { Download } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui";
import { useLocale } from "@/lib/i18n";

const DATASETS = [
  { key: "conversations", title: ["المحادثات", "Conversations"], desc: ["كل المحادثات مع بيانات الحالة والرد والمدة والكامبين.", "All conversations with status, response, duration and campaign."] },
  { key: "agents", title: ["الموظفون", "Agents"], desc: ["لوحة أداء الموظفين اليومية.", "Daily agent performance leaderboard."] },
  { key: "teams", title: ["التيمات", "Teams"], desc: ["أداء كل تيم وأعضائه.", "Performance per team and members."] },
  { key: "departments", title: ["الأقسام", "Departments"], desc: ["ملخص الأقسام: الحجم والرد والحل وخرق SLA.", "Department summary: volume, response, resolution, SLA breaches."] },
  { key: "labels", title: ["Labels", "Labels"], desc: ["أداء كل التصنيفات.", "Performance per label."] },
  { key: "campaigns", title: ["الكامبينات", "Campaigns"], desc: ["الكامبينات مع المُشغّل ونسب الإرسال والرد.", "Campaigns with operator, send and reply rates."] },
  { key: "sla", title: ["خرق SLA", "SLA breaches"], desc: ["المحادثات التي خرقت هدف الرد الأول.", "Conversations that breached the first-response target."] },
  { key: "fahd", title: ["بوت فهد", "Fahd Bot"], desc: ["محادثات حوّلها فهد ولم يرد عليها موظف.", "Conversations Fahd handed off with no agent reply."] },
] as const;

export default function ExportsPage() {
  const { tr, locale } = useLocale();
  const i = locale === "ar" ? 0 : 1;
  const searchParams = useSearchParams();
  const qs = searchParams.toString();

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {tr("كل تصدير يحترم الفلاتر المطبّقة حاليًا (التاريخ والقسم والموظف…). الملفات بصيغة CSV.", "Every export respects the currently applied filters (date, department, agent…). Files are CSV.")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DATASETS.map((d) => (
          <Card key={d.key} className="flex flex-col justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{d.title[i]}</div>
              <div className="mt-1 text-xs text-muted-foreground">{d.desc[i]}</div>
            </div>
            <a href={`/api/export/${d.key}${qs ? `?${qs}` : ""}`} className="btn-primary w-full text-sm">
              <Download className="h-4 w-4" /> {tr("تنزيل CSV", "Download CSV")}
            </a>
          </Card>
        ))}
      </div>
    </div>
  );
}
