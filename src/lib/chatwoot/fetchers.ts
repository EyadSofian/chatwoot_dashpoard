import { ChatwootClient, getMeta, getPayload } from "./client";
import type { CwConversation, CwMessage } from "./types";

/**
 * Fetch a conversation's messages oldest→newest. Chatwoot returns ~20 recent
 * messages and pages backwards via `before`, so we walk back to the start to
 * capture the first human reply (which lives at the beginning of long threads).
 */
export async function fetchAllMessages(
  client: ChatwootClient,
  conversationId: number,
): Promise<CwMessage[]> {
  const collected = new Map<number, CwMessage>();
  let before: number | undefined;
  const seenCursors = new Set<number>();

  while (true) {
    const query: Record<string, unknown> = {};
    if (before !== undefined) query.before = before;
    const res = await client.conversationMessages(conversationId, query);
    const page = getPayload<CwMessage>(res);
    if (!page.length) break;

    let minId = Number.POSITIVE_INFINITY;
    for (const msg of page) {
      if (typeof msg.id === "number") {
        collected.set(msg.id, msg);
        if (msg.id < minId) minId = msg.id;
      }
    }
    if (page.length < 20 || !Number.isFinite(minId)) break;
    if (seenCursors.has(minId)) {
      throw new Error(`Chatwoot repeated the message cursor for conversation ${conversationId}`);
    }
    seenCursors.add(minId);
    before = minId;
  }

  return [...collected.values()].sort((a, b) => {
    const at = typeof a.created_at === "number" ? a.created_at : Date.parse(String(a.created_at));
    const bt = typeof b.created_at === "number" ? b.created_at : Date.parse(String(b.created_at));
    return (at || 0) - (bt || 0);
  });
}

/**
 * Iterate account conversations page by page (status=all), invoking `onPage`.
 * Stops when a page is empty, the callback returns `false`, or maxPages hit.
 */
export async function iterateConversations(
  client: ChatwootClient,
  opts: {
    maxPages?: number;
    startPage?: number;
    status?: "all" | "open" | "pending" | "resolved" | "snoozed";
    onPage: (convs: CwConversation[], page: number) => Promise<boolean | void>;
  },
): Promise<{ pages: number; scanned: number; total: number | null; truncated: boolean; nextPage: number | null }> {
  const startPage = Math.max(1, opts.startPage ?? 1);
  const maxPages = opts.maxPages === undefined ? Number.POSITIVE_INFINITY : Math.max(1, opts.maxPages);
  let pages = 0;
  let scanned = 0;
  let total: number | null = null;
  const seenPageSignatures = new Set<string>();

  for (let page = startPage; pages < maxPages; page++) {
    const res = await client.listConversations({ status: opts.status ?? "all", page, sort_order: "desc" });
    const convs = (res?.data?.payload ?? getPayload<CwConversation>(res)) as CwConversation[];
    if (!convs.length) return { pages, scanned, total, truncated: false, nextPage: null };
    pages++;
    scanned += convs.length;

    const rawTotal = getMeta(res).all_count;
    const parsedTotal = typeof rawTotal === "number" ? rawTotal : Number(rawTotal);
    if (Number.isFinite(parsedTotal)) total = parsedTotal;

    const signature = `${convs[0]?.id ?? ""}:${convs.at(-1)?.id ?? ""}:${convs.length}`;
    if (seenPageSignatures.has(signature)) throw new Error(`Chatwoot repeated conversation page ${page}`);
    seenPageSignatures.add(signature);

    const keepGoing = await opts.onPage(convs, page);
    if (keepGoing === false) return { pages, scanned, total, truncated: true, nextPage: page + 1 };
    const scannedFromStart = (page - 1) * 25 + convs.length;
    if (total !== null && scannedFromStart >= total) return { pages, scanned, total, truncated: false, nextPage: null };
    if (total === null && convs.length < 25) return { pages, scanned, total, truncated: false, nextPage: null };
  }

  return { pages, scanned, total, truncated: true, nextPage: startPage + pages };
}
