-- Reporting paths must aggregate in PostgreSQL without scanning the whole table.
CREATE INDEX IF NOT EXISTS "conversations_assigneeCwId_status_idx"
  ON "conversations"("assigneeCwId", "status");

CREATE INDEX IF NOT EXISTS "conversations_teamCwId_status_idx"
  ON "conversations"("teamCwId", "status");

CREATE INDEX IF NOT EXISTS "conversations_status_needsReply_idx"
  ON "conversations"("status", "needsReply");

CREATE INDEX IF NOT EXISTS "conversations_createdAtCw_assigneeCwId_idx"
  ON "conversations"("createdAtCw", "assigneeCwId");

CREATE INDEX IF NOT EXISTS "conversations_resolvedAt_assigneeCwId_idx"
  ON "conversations"("resolvedAt", "assigneeCwId");

CREATE INDEX IF NOT EXISTS "conversations_labels_idx"
  ON "conversations" USING GIN ("labels");

CREATE INDEX IF NOT EXISTS "assignment_intervals_startedAt_assigneeCwId_idx"
  ON "assignment_intervals"("startedAt", "assigneeCwId");

CREATE INDEX IF NOT EXISTS "bot_handoffs_handoffAt_department_idx"
  ON "bot_handoffs"("handoffAt", "department");
