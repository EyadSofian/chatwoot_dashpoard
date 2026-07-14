import { prisma } from "@/lib/db";
import { ChatwootClient } from "@/lib/chatwoot/client";
import { fetchAllMessages, iterateConversations } from "@/lib/chatwoot/fetchers";
import { assembleConversation } from "@/lib/metrics/conversation";
import { toDate } from "@/lib/time";
import { syncEntities } from "./entities";
import { buildAssembleContext } from "./context";
import { persistConversation } from "./persist";

export interface BackfillOptions {
  days: number;
  maxPages?: number;
  maxConversations?: number;
}

export interface BackfillStats {
  syncRunId: string;
  days: number;
  entities: { agents: number; teams: number; inboxes: number };
  conversationsProcessed: number;
  conversationsFailed: number;
  pages: number;
}

/**
 * Backfill the last N days of conversations from Chatwoot: sync entities, then
 * page conversations (newest first), fetching full details + messages for each
 * and running the metrics engine. Idempotent — safe to re-run.
 */
export async function runBackfill(opts: BackfillOptions): Promise<BackfillStats> {
  const days = Math.max(1, Math.min(opts.days, 365));
  const maxPages = Math.max(1, Math.min(opts.maxPages ?? 60, 200));
  const maxConversations = Math.max(1, Math.min(opts.maxConversations ?? 5000, 20000));
  const since = new Date(Date.now() - days * 86400 * 1000);

  const run = await prisma.syncRun.create({
    data: { type: "backfill", status: "running", params: { days, maxPages, maxConversations } },
  });

  const client = new ChatwootClient();
  const entities = await syncEntities(client);
  const ctx = await buildAssembleContext(); // synthesized events; webhooks refine later

  let processed = 0;
  let failed = 0;
  let pages = 0;

  try {
    await iterateConversations(client, {
      maxPages,
      onPage: async (convs, page) => {
        pages = page;
        let anyInWindow = false;
        for (const summary of convs) {
          if (processed >= maxConversations) return false;
          const lastActivity = toDate(summary.last_activity_at) ?? toDate(summary.created_at);
          if (lastActivity && lastActivity.getTime() < since.getTime()) continue;
          anyInWindow = true;
          try {
            const [detail, messages] = await Promise.all([
              client.conversationDetails(summary.id),
              fetchAllMessages(client, summary.id),
            ]);
            const assembled = assembleConversation(detail, messages, { ...ctx, now: new Date() });
            await persistConversation(assembled);
            processed++;
          } catch {
            failed++;
          }
        }
        // Conversations are newest-first; once a whole page is older than the
        // window there is nothing left to backfill.
        return anyInWindow;
      },
    });

    const stats: BackfillStats = {
      syncRunId: String(run.id),
      days,
      entities,
      conversationsProcessed: processed,
      conversationsFailed: failed,
      pages,
    };
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: failed ? "partial" : "success", finishedAt: new Date(), stats: stats as unknown as object },
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
