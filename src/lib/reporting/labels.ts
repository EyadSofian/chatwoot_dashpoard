import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { average, median } from "@/lib/format";
import { conversationWhere, type ReportFilters } from "./filters";
import { andSql, conversationSqlConditions } from "./sqlFilters";

/**
 * Label performance.
 *
 * Unlike a team, a conversation can carry SEVERAL labels — and it genuinely
 * belongs to each of them. So a conversation counts once per label it holds, and
 * the label rows deliberately sum to MORE than the conversation total. That is
 * the correct answer for labels, not a double-count bug; the summary reports the
 * real conversation total separately so the two are never confused.
 */

export interface LabelRow {
  title: string;
  color: string | null;
  description: string | null;
  conversations: number;
  open: number;
  pending: number;
  resolved: number;
  replied: number;
  needsReply: number;
  avgResponseSeconds: number | null;
  medianResponseSeconds: number | null;
  avgResolutionSeconds: number | null;
  slaBreaches: number;
  /** Share of the period's conversations carrying this label (0–1). */
  share: number;
  lastActivityAt: Date | null;
  hasActivity: boolean;
}

export interface LabelsSummary {
  totalLabels: number;
  activeLabels: number;
  /** Real conversation count — NOT the sum of the label rows. */
  conversations: number;
  /** Conversations in the period carrying no label at all. */
  unlabeled: number;
  avgResponseSeconds: number | null;
  slaBreaches: number;
}

export interface LabelsResult {
  rows: LabelRow[];
  summary: LabelsSummary;
}

export interface LabelRecord {
  title: string;
  color: string | null;
  description: string | null;
}

export interface LabelConversation {
  labels: string[];
  status: string | null;
  needsReply: boolean;
  handledByHuman: boolean;
  responseSeconds: number | null;
  conversationDurationSeconds: number | null;
  slaFirstResponseBreached: boolean;
  lastMessageAt: Date | null;
}

interface Bucket {
  resp: number[];
  res: number[];
}

const laterOf = (a: Date | null, b: Date | null): Date | null => {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
};

function emptyRow(title: string, info: Partial<LabelRecord> = {}): LabelRow {
  return {
    title,
    color: info.color ?? null,
    description: info.description ?? null,
    conversations: 0,
    open: 0,
    pending: 0,
    resolved: 0,
    replied: 0,
    needsReply: 0,
    avgResponseSeconds: null,
    medianResponseSeconds: null,
    avgResolutionSeconds: null,
    slaBreaches: 0,
    share: 0,
    lastActivityAt: null,
    hasActivity: false,
  };
}

/**
 * Merge the period's conversations onto the FULL label roster — same rule as
 * agents and teams: the date range decides the numbers, never who is in the table.
 */
export function buildLabelsReport(input: {
  labels: LabelRecord[];
  conversations: LabelConversation[];
  activeOnly?: boolean;
}): LabelsResult {
  const { labels, conversations, activeOnly = false } = input;

  const rows = new Map<string, LabelRow>();
  const buckets = new Map<string, Bucket>();
  const bucket = (t: string): Bucket => {
    let b = buckets.get(t);
    if (!b) {
      b = { resp: [], res: [] };
      buckets.set(t, b);
    }
    return b;
  };

  // 1. Seed from the roster — this is what keeps an unused label visible.
  for (const l of labels) rows.set(l.title, emptyRow(l.title, l));

  let unlabeled = 0;

  // 2. A conversation lands in every label it carries.
  for (const c of conversations) {
    const titles = (c.labels ?? []).filter(Boolean);
    if (!titles.length) {
      unlabeled++;
      continue;
    }

    for (const title of titles) {
      // A label applied in Chatwoot but since deleted from the roster still owns
      // its history — never drop the numbers on the floor.
      let row = rows.get(title);
      if (!row) {
        row = emptyRow(title);
        rows.set(title, row);
      }

      const b = bucket(title);
      row.conversations++;
      row.hasActivity = true;
      if (c.status === "open") row.open++;
      if (c.status === "pending") row.pending++;
      if (c.status === "resolved") row.resolved++;
      if (c.handledByHuman) row.replied++;
      if (c.needsReply) row.needsReply++;
      if (c.slaFirstResponseBreached) row.slaBreaches++;
      row.lastActivityAt = laterOf(row.lastActivityAt, c.lastMessageAt);
      if (c.responseSeconds !== null) b.resp.push(c.responseSeconds);
      if (c.conversationDurationSeconds !== null) b.res.push(c.conversationDurationSeconds);
    }
  }

  const total = conversations.length;

  for (const [title, b] of buckets) {
    const row = rows.get(title)!;
    row.avgResponseSeconds = average(b.resp);
    row.medianResponseSeconds = median(b.resp);
    row.avgResolutionSeconds = average(b.res);
    row.share = total > 0 ? row.conversations / total : 0;
  }

  const all = [...rows.values()];

  const summary: LabelsSummary = {
    totalLabels: all.length,
    activeLabels: all.filter((r) => r.hasActivity).length,
    // The real total, not the sum of the rows — a conversation with three labels
    // is still one conversation.
    conversations: total,
    unlabeled,
    avgResponseSeconds: average(
      conversations.map((c) => c.responseSeconds).filter((v): v is number => v !== null),
    ),
    slaBreaches: conversations.filter((c) => c.slaFirstResponseBreached).length,
  };

  const visible = activeOnly ? all.filter((r) => r.hasActivity) : all;

  visible.sort((a, b) => {
    if (a.hasActivity !== b.hasActivity) return a.hasActivity ? -1 : 1;
    if (b.conversations !== a.conversations) return b.conversations - a.conversations;
    return a.title.localeCompare(b.title, "ar");
  });

  return { rows: visible, summary };
}

export async function getLabels(f: ReportFilters): Promise<LabelsResult> {
  // The label filter narrows which conversations are counted; it must not shrink
  // the roster, so the label query carries no filter at all.
  const conditions = conversationSqlConditions(f, { alias: "c" });
  const whereSql = andSql(conditions);
  const [labels, aggregates, summaryRows] = await Promise.all([
    prisma.label.findMany({
      select: { title: true, color: true, description: true },
      orderBy: { title: "asc" },
    }),
    prisma.$queryRaw<LabelAggregate[]>(Prisma.sql`
      WITH filtered AS (
        SELECT c.* FROM "conversations" c ${whereSql}
      )
      SELECT
        label."title",
        COUNT(*)::bigint AS "conversations",
        COUNT(*) FILTER (WHERE c."status" = 'open')::bigint AS "open",
        COUNT(*) FILTER (WHERE c."status" = 'pending')::bigint AS "pending",
        COUNT(*) FILTER (WHERE c."status" = 'resolved')::bigint AS "resolved",
        COUNT(*) FILTER (WHERE c."handledByHuman" = TRUE)::bigint AS "replied",
        COUNT(*) FILTER (WHERE c."needsReply" = TRUE)::bigint AS "needsReply",
        AVG(c."responseSeconds")::double precision AS "avgResponseSeconds",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c."responseSeconds") FILTER (
          WHERE c."responseSeconds" IS NOT NULL
        )::double precision AS "medianResponseSeconds",
        AVG(c."conversationDurationSeconds")::double precision AS "avgResolutionSeconds",
        COUNT(*) FILTER (WHERE c."slaFirstResponseBreached" = TRUE)::bigint AS "slaBreaches",
        MAX(c."lastMessageAt") AS "lastActivityAt"
      FROM filtered c
      CROSS JOIN LATERAL UNNEST(c."labels") AS label("title")
      GROUP BY label."title"
    `),
    prisma.$queryRaw<LabelSummaryAggregate[]>(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS "conversations",
        COUNT(*) FILTER (WHERE COALESCE(CARDINALITY(c."labels"), 0) = 0)::bigint AS "unlabeled",
        AVG(c."responseSeconds")::double precision AS "avgResponseSeconds",
        COUNT(*) FILTER (WHERE c."slaFirstResponseBreached" = TRUE)::bigint AS "slaBreaches"
      FROM "conversations" c
      ${whereSql}
    `),
  ]);

  const rows = new Map<string, LabelRow>();
  for (const label of labels) rows.set(label.title, emptyRow(label.title, label));
  const total = asNumber(summaryRows[0]?.conversations);
  for (const aggregate of aggregates) {
    let row = rows.get(aggregate.title);
    if (!row) {
      row = emptyRow(aggregate.title);
      rows.set(aggregate.title, row);
    }
    row.conversations = asNumber(aggregate.conversations);
    row.open = asNumber(aggregate.open);
    row.pending = asNumber(aggregate.pending);
    row.resolved = asNumber(aggregate.resolved);
    row.replied = asNumber(aggregate.replied);
    row.needsReply = asNumber(aggregate.needsReply);
    row.avgResponseSeconds = nullableNumber(aggregate.avgResponseSeconds);
    row.medianResponseSeconds = nullableNumber(aggregate.medianResponseSeconds);
    row.avgResolutionSeconds = nullableNumber(aggregate.avgResolutionSeconds);
    row.slaBreaches = asNumber(aggregate.slaBreaches);
    row.share = total ? row.conversations / total : 0;
    row.lastActivityAt = aggregate.lastActivityAt;
    row.hasActivity = row.conversations > 0;
  }

  const all = [...rows.values()];
  const summary: LabelsSummary = {
    totalLabels: all.length,
    activeLabels: all.filter((row) => row.hasActivity).length,
    conversations: total,
    unlabeled: asNumber(summaryRows[0]?.unlabeled),
    avgResponseSeconds: nullableNumber(summaryRows[0]?.avgResponseSeconds),
    slaBreaches: asNumber(summaryRows[0]?.slaBreaches),
  };
  const visible = f.activeOnly ? all.filter((row) => row.hasActivity) : all;
  visible.sort((a, b) => {
    if (a.hasActivity !== b.hasActivity) return a.hasActivity ? -1 : 1;
    if (b.conversations !== a.conversations) return b.conversations - a.conversations;
    return a.title.localeCompare(b.title, "en");
  });
  return { rows: visible, summary };
}

interface LabelAggregate {
  title: string;
  conversations: bigint | number | string;
  open: bigint | number | string;
  pending: bigint | number | string;
  resolved: bigint | number | string;
  replied: bigint | number | string;
  needsReply: bigint | number | string;
  avgResponseSeconds: number | string | null;
  medianResponseSeconds: number | string | null;
  avgResolutionSeconds: number | string | null;
  slaBreaches: bigint | number | string;
  lastActivityAt: Date | null;
}

interface LabelSummaryAggregate {
  conversations: bigint | number | string;
  unlabeled: bigint | number | string;
  avgResponseSeconds: number | string | null;
  slaBreaches: bigint | number | string;
}

function asNumber(value: bigint | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: bigint | number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
