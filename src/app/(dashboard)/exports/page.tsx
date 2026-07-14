"use client";

import { Download } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui";

const DATASETS = [
  { key: "conversations", title: "المحادثات", desc: "كل المحادثات مع بيانات الحالة والرد والمدة والكامبين." },
  { key: "agents", title: "الموظفون", desc: "لوحة أداء الموظفين اليومية." },
  { key: "departments", title: "الأقسام", desc: "ملخص الأقسام: الحجم والرد والحل وخرق SLA." },
  { key: "campaigns", title: "الكامبينات", desc: "الكامبينات مع المُشغّل ونسب الإرسال والرد." },
  { key: "sla", title: "خرق SLA", desc: "المحادثات التي خرقت هدف الرد الأول." },
  { key: "fahd", title: "بوت فهد", desc: "محادثات حوّلها فهد ولم يرد عليها موظف." },
];

export default function ExportsPage() {
  const searchParams = useSearchParams();
  const qs = searchParams.toString();

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        كل تصدير يحترم الفلاتر المطبّقة حاليًا (التاريخ والقسم والموظف…). الملفات بصيغة CSV متوافقة مع Excel العربي.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DATASETS.map((d) => (
          <Card key={d.key} className="flex flex-col justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{d.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{d.desc}</div>
            </div>
            <a href={`/api/export/${d.key}${qs ? `?${qs}` : ""}`} className="btn-primary w-full text-sm">
              <Download className="h-4 w-4" /> تنزيل CSV
            </a>
          </Card>
        ))}
      </div>
    </div>
  );
}
