-- Team analytics.
-- Purely additive: a new join table, one nullable column, and indexes.
-- Nothing is dropped or rewritten, so this applies cleanly to a live database.

-- CreateTable
CREATE TABLE "team_memberships" (
    "teamCwId" INTEGER NOT NULL,
    "agentCwId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("teamCwId","agentCwId")
);

-- CreateIndex
CREATE INDEX "team_memberships_agentCwId_idx" ON "team_memberships"("agentCwId");

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_teamCwId_fkey" FOREIGN KEY ("teamCwId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_agentCwId_fkey" FOREIGN KEY ("agentCwId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: the team a conversation sat in at assignment time.
ALTER TABLE "assignment_intervals" ADD COLUMN "teamCwId" INTEGER;

-- CreateIndex
CREATE INDEX "assignment_intervals_teamCwId_startedAt_idx" ON "assignment_intervals"("teamCwId", "startedAt");

-- CreateIndex: columns the report filters actually hit.
CREATE INDEX "conversations_assignedAt_idx" ON "conversations"("assignedAt");
CREATE INDEX "conversations_firstHumanReplyAt_idx" ON "conversations"("firstHumanReplyAt");
CREATE INDEX "conversations_resolvedAt_idx" ON "conversations"("resolvedAt");
CREATE INDEX "conversations_slaFirstResponseBreached_idx" ON "conversations"("slaFirstResponseBreached");
CREATE INDEX "conversations_teamCwId_createdAtCw_idx" ON "conversations"("teamCwId", "createdAtCw");
