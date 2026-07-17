-- Remove inferred assignment/response data.
--
-- Before this, a conversation with no real assignment history (backfill cannot
-- recover assignee_changed timing from Chatwoot's API) was assumed to have been
-- assigned at creation. That produced a "response time from assignment" measured
-- from the creation timestamp — a number that looked real but was invented, and
-- it dragged the averages and SLA breach counts toward fiction.
--
-- The metrics engine no longer makes that assumption. This migration clears the
-- values already written for it, so "unknown" reads as unknown until a real
-- assignee_changed event (from the webhook) refines it.
--
-- The predicate is stable — a conversation either has a real assigned/unassigned
-- event or it does not — so this migration is idempotent and safe to re-run.

-- 1. Assignment intervals manufactured from the creation time. A conversation
--    with no stored assigned/unassigned event can only have inferred intervals.
DELETE FROM "assignment_intervals" i
WHERE NOT EXISTS (
  SELECT 1 FROM "conversation_events" e
  WHERE e."conversationCwId" = i."conversationCwId"
    AND e."type" IN ('assigned', 'unassigned')
);

-- 2. The denormalized first-response columns computed from those intervals.
--    Only rows that actually carry an inferred assignment are touched; a
--    conversation that never had an assignee is already null here.
UPDATE "conversations" c
SET "assignedAt" = NULL,
    "responseSeconds" = NULL,
    "slaFirstResponseState" = 'healthy',
    "slaFirstResponseBreached" = FALSE
WHERE c."assignedAt" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "conversation_events" e
    WHERE e."conversationCwId" = c."chatwootId"
      AND e."type" IN ('assigned', 'unassigned')
  );

-- 3. The per-conversation response metric rows built the same way.
UPDATE "response_metrics" rm
SET "assignedAt" = NULL,
    "firstReplyAt" = NULL,
    "responseSeconds" = NULL,
    "businessSeconds" = NULL,
    "breachedSla" = FALSE
WHERE rm."responseSeconds" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "conversation_events" e
    WHERE e."conversationCwId" = rm."conversationCwId"
      AND e."type" IN ('assigned', 'unassigned')
  );
