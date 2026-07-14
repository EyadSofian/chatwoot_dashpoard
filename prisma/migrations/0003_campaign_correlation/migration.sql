-- Campaign reply correlation.
--
-- Replies were keyed by [conversationCwId, campaignLabel]. A label is reused
-- across campaigns and the same customer can be sent several, so that key merged
-- rows that were never the same send. Replies are now tied to the job/recipient
-- that produced them, measured from the actual outbound template message.
--
-- Existing rows are preserved and tagged as attribute-fallback (which is exactly
-- what they were), so nothing is lost and nothing approximate is mistaken for
-- precise afterwards.

-- ── CampaignJob ─────────────────────────────────────────────────────────────
ALTER TABLE "campaign_jobs" ADD COLUMN "reconciledAt" TIMESTAMP(3);

-- ── CampaignRecipient ───────────────────────────────────────────────────────
ALTER TABLE "campaign_recipients" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "campaign_recipients" ADD COLUMN "correlationState" TEXT;

CREATE INDEX "campaign_recipients_campaignJobId_status_idx" ON "campaign_recipients"("campaignJobId", "status");
CREATE INDEX "campaign_recipients_messageCwId_idx" ON "campaign_recipients"("messageCwId");

-- ── CampaignReply ───────────────────────────────────────────────────────────
ALTER TABLE "campaign_replies" ADD COLUMN "campaignJobId" BIGINT;
ALTER TABLE "campaign_replies" ADD COLUMN "campaignRecipientId" BIGINT;
ALTER TABLE "campaign_replies" ADD COLUMN "campaignMessageCwId" INTEGER;
ALTER TABLE "campaign_replies" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "campaign_replies" ADD COLUMN "correlationMethod" TEXT NOT NULL DEFAULT 'attribute_fallback';
ALTER TABLE "campaign_replies" ADD COLUMN "confidence" TEXT NOT NULL DEFAULT 'low';
ALTER TABLE "campaign_replies" ADD COLUMN "dedupeKey" TEXT;
ALTER TABLE "campaign_replies" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- A job-correlated reply has no label of its own; the job carries it.
ALTER TABLE "campaign_replies" ALTER COLUMN "campaignLabel" DROP NOT NULL;

-- Every existing row came from conversation custom attributes. The old unique
-- guaranteed (conversationCwId, campaignLabel) was distinct, so this cannot collide.
UPDATE "campaign_replies"
SET "dedupeKey" = 'attr:' || "conversationCwId"::text || ':' || COALESCE("campaignLabel", '')
WHERE "dedupeKey" IS NULL;

-- The key that merged different sends.
DROP INDEX IF EXISTS "campaign_replies_conversationCwId_campaignLabel_key";

ALTER TABLE "campaign_replies" ALTER COLUMN "dedupeKey" SET NOT NULL;

CREATE UNIQUE INDEX "campaign_replies_dedupeKey_key" ON "campaign_replies"("dedupeKey");
CREATE UNIQUE INDEX "campaign_replies_campaignJobId_conversationCwId_key" ON "campaign_replies"("campaignJobId", "conversationCwId");
CREATE INDEX "campaign_replies_campaignJobId_idx" ON "campaign_replies"("campaignJobId");
CREATE INDEX "campaign_replies_correlationMethod_idx" ON "campaign_replies"("correlationMethod");

-- AddForeignKey
ALTER TABLE "campaign_replies" ADD CONSTRAINT "campaign_replies_campaignJobId_fkey" FOREIGN KEY ("campaignJobId") REFERENCES "campaign_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaign_replies" ADD CONSTRAINT "campaign_replies_campaignRecipientId_fkey" FOREIGN KEY ("campaignRecipientId") REFERENCES "campaign_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
