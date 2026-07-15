import { prisma } from "@/lib/db";
import { ChatwootClient } from "@/lib/chatwoot/client";
import { fetchAllMessages, iterateConversations } from "@/lib/chatwoot/fetchers";
import { assembleConversation } from "@/lib/metrics/conversation";
import { toDate } from "@/lib/time";
import { syncEntities } from "./entities";
import { buildAssembleContext, loadConversationEventContext } from "./context";
import { persistConversation } from "./persist";

export interface BackfillOptions {
  days: number;
  scope?: "recent" | "all";
  startPage?: number;
  maxPages?: number;
  maxConversations?: number;
  concurrency?: number;
}

export interface BackfillStats {
  syncRunId: string;
  days: number;
  scope: "recent" | "all";
  entities: { agents: number; teams: number; inboxes: number; memberships: number };
  conversationsProcessed: number;
  conversationsFailed: number;
  pages: number;
  conversationsScanned: number;
  estimatedTotal: number | null;
  truncated: boolean;
  nextPage: number | null;
  remainingEstimate: number | null;
}

/**
 * Backfill the last N days of conversations from Chatwoot: sync entities, then
 * page conversations (newest first), fetching full details + messages for each
 * and running the metrics engine. Idempotent — safe to re-run.
 */
export async function runBackfill(opts: BackfillOptions): Promise<BackfillStats> {
  const days = Math.max(1, Math.min(opts.days, 3650));
  const scope = opts.scope ?? "recent";
  const startPage = Math.max(1, opts.startPage ?? 1);
  const maxPages = opts.maxPages === undefined ? undefined : Math.max(1, opts.maxPages);
  const maxConversations = opts.maxConversations === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(1, opts.maxConversations);
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 6, 12));
  const since = new Date(Date.now() - days * 86400 * 1000);

  const run = await prisma.syncRun.create({
    data: {
      type: "backfill",
      status: "running",
      params: {
        days,
        scope,
        startPage,
        maxPages: maxPages ?? null,
        maxConversations: Number.isFinite(maxConversations) ? maxConversations : null,
        concurrency,
      },
    },
  });

  const client = new ChatwootClient();
  const entities = await syncEntities(client);
  const ctx = await buildAssembleContext(); // synthesized events; webhooks refine later

  let processed = 0;
  let failed = 0;
  let attempted = 0;
  let pages = 0;
  let limitHit = false;
  let windowComplete = false;
  let stoppedOnPage: number | null = null;

  try {
    const iteration = await iterateConversations(client, {
      startPage,
      maxPages,
      onPage: async (convs, page) => {
        pages++;
        const candidates = [];
        let pageHasRecent = scope === "all";
        for (const summary of convs) {
          const lastActivity = toDate(summary.last_activity_at) ?? toDate(summary.created_at);
          if (scope === "recent" && lastActivity && lastActivity.getTime() < since.getTime()) continue;
          pageHasRecent = true;
          if (attempted + candidates.length >= maxConversations) {
            limitHit = true;
            stoppedOnPage = page;
            break;
          }
          candidates.push(summary);
        }

        await mapConcurrent(candidates, concurrency, async (summary) => {
          attempted++;
          try {
            const [detail, messages, eventContext] = await Promise.all([
              client.conversationDetails(summary.id),
              fetchAllMessages(client, summary.id),
              loadConversationEventContext(summary.id),
            ]);
            const assembled = assembleConversation(detail, messages, { ...ctx, ...eventContext, now: new Date() });
            await persistConversation(assembled);
            processed++;
          } catch {
            failed++;
          }
        });

        if (limitHit) return false;
        // Conversations are newest-first; an entirely old page means the recent
        // window is complete, not truncated.
        if (scope === "recent" && !pageHasRecent) {
          windowComplete = true;
          return false;
        }
        return true;
      },
    });

    const truncated = limitHit || (!windowComplete && iteration.truncated);
    const nextPage = truncated ? stoppedOnPage ?? iteration.nextPage : null;
    const remainingEstimate =
      truncated && iteration.total !== null
        ? Math.max(0, iteration.total - ((nextPage ?? startPage) - 1) * 25)
        : null;

    const stats: BackfillStats = {
      syncRunId: String(run.id),
      days,
      scope,
      entities,
      conversationsProcessed: processed,
      conversationsFailed: failed,
      pages,
      conversationsScanned: iteration.scanned,
      estimatedTotal: iteration.total,
      truncated,
      nextPage,
      remainingEstimate,
    };
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: failed || truncated ? "partial" : "success",
        finishedAt: new Date(),
        stats: stats as unknown as object,
      },
    });
    return stats;
  } catch (error) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "error", finishedAt: new Date(), error: (error as Error).message?.slice(0, 500) },
    });
    throw error;
  }
}

async function mapConcurrent<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        await worker(items[index]!);
      }
    }),
  );
}
