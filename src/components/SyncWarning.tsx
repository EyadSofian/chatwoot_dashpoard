"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useApiData } from "@/lib/client/api";
import { useLocale } from "@/lib/i18n";
import type { FilterOptions } from "@/lib/reporting/filterOptions";

/**
 * Two failure modes that make the dashboard silently wrong, each with a banner:
 *
 * 1. No metadata sync — the agent/team rosters are empty, screens look "broken".
 * 2. No webhook has EVER been received — the mirror only knows what the last
 *    manual backfill saw, so assignments and statuses drift from Chatwoot
 *    (an agent shows 11 conversations while Chatwoot says 8). This is the
 *    root cause of stale-assignee reports, so it must be loud.
 */
export function SyncWarning() {
  const { data } = useApiData<FilterOptions>("/api/filters");
  const { tr } = useLocale();
  if (!data) return null;

  if (data.metadata?.synced === false) {
    return (
      <Banner
        text={tr(
          "شغِّل Sync لبيانات Chatwoot لعرض جميع الموظفين والتيمات",
          "Run a Chatwoot metadata sync to show all agents and teams",
        )}
        cta={tr("اذهب للإعدادات", "Go to Settings")}
      />
    );
  }

  if (data.metadata?.lastWebhookAt === null) {
    return (
      <Banner
        text={tr(
          "الويبهوك غير متصل — لم يصل أي حدث من Chatwoot. الإسنادات والحالات ستتقادم حتى يُضاف الويبهوك.",
          "Webhook not connected — no Chatwoot event has ever arrived. Assignments and statuses will go stale until the webhook is added.",
        )}
        cta={tr("إعداد الويبهوك", "Set up the webhook")}
      />
    );
  }

  return null;
}

function Banner({ text, cta }: { text: string; cta: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-card border border-warning/30 bg-warning/5 px-4 py-3">
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning-fg" aria-hidden />
      <p className="flex-1 text-sm font-semibold text-warning-fg">{text}</p>
      <Link href="/settings" className="btn-primary shrink-0 px-3 py-1.5 text-xs">
        {cta}
      </Link>
    </div>
  );
}
