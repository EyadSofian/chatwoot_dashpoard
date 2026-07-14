import { ChatwootClient, getPayload } from "./client";
import type { CwConversation, CwMessage } from "./types";

/**
 * Fetch a conversation's messages oldest→newest. Chatwoot returns ~20 recent
 * messages and pages backwards via `before`, so we walk back to the start to
 * capture the first human reply (which lives at the beginning of long threads).
 */
export async function fetchAllMessages(
  client: ChatwootClient,
  conversationId: number,
  maxMessages = 400,
): Promise<CwMessage[]> {
  const collected = new Map<number, CwMessage>();
  let before: number | undefined;
  let guard = 0;

  while (guard++ < 30) {
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
    if (collected.size >= maxMessages) break;
    if (page.length < 20 || !Number.isFinite(minId)) break;
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
  opts: { maxPages: number; onPage: (convs: CwConversation[], page: number) => Promise<boolean | void> },
): Promise<void> {
  for (let page = 1; page <= opts.maxPages; page++) {
    const res = await client.listConversations({ status: "all", page, sort_order: "desc" });
    const convs = (res?.data?.payload ?? getPayload<CwConversation>(res)) as CwConversation[];
    if (!convs.length) break;
    const keepGoing = await opts.onPage(convs, page);
    if (keepGoing === false) break;
    if (convs.length < 25) break; // last page
  }
}
