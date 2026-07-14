-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "raw_events" (
    "id" BIGSERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "event" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "signatureOk" BOOLEAN NOT NULL DEFAULT false,
    "conversationCwId" INTEGER,
    "messageCwId" INTEGER,
    "occurredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processError" TEXT,
    "payload" JSONB NOT NULL,

    CONSTRAINT "raw_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" INTEGER NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "role" TEXT,
    "availability" TEXT,
    "thumbnail" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" INTEGER NOT NULL,
    "name" TEXT,
    "department" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inboxes" (
    "id" INTEGER NOT NULL,
    "name" TEXT,
    "channelType" TEXT,
    "department" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inboxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" INTEGER NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "identifier" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" BIGSERIAL NOT NULL,
    "chatwootId" INTEGER NOT NULL,
    "displayId" INTEGER,
    "accountId" INTEGER,
    "inboxCwId" INTEGER,
    "inboxName" TEXT,
    "teamCwId" INTEGER,
    "teamName" TEXT,
    "assigneeCwId" INTEGER,
    "assigneeName" TEXT,
    "contactCwId" INTEGER,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "status" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "department" TEXT,
    "createdAtCw" TIMESTAMP(3),
    "firstOpenedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "lastMessageType" TEXT,
    "lastActivityAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "firstHumanReplyAt" TIMESTAMP(3),
    "responseSeconds" INTEGER,
    "needsReply" BOOLEAN NOT NULL DEFAULT false,
    "handledByHuman" BOOLEAN NOT NULL DEFAULT false,
    "conversationDurationSeconds" INTEGER,
    "conversationBusinessSeconds" INTEGER,
    "campaignLabel" TEXT,
    "campaignSource" TEXT,
    "campaignTemplate" TEXT,
    "campaignStatus" TEXT,
    "campaignCreatedAt" TIMESTAMP(3),
    "isCampaign" BOOLEAN NOT NULL DEFAULT false,
    "botInvolved" BOOLEAN NOT NULL DEFAULT false,
    "botReleaseAt" TIMESTAMP(3),
    "slaFirstResponseState" TEXT,
    "slaResolutionState" TEXT,
    "slaFirstResponseBreached" BOOLEAN NOT NULL DEFAULT false,
    "slaResolutionBreached" BOOLEAN NOT NULL DEFAULT false,
    "customAttributes" JSONB,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" BIGSERIAL NOT NULL,
    "chatwootId" INTEGER NOT NULL,
    "conversationId" BIGINT NOT NULL,
    "conversationCwId" INTEGER NOT NULL,
    "messageType" INTEGER,
    "contentType" TEXT,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT,
    "senderType" TEXT,
    "senderId" INTEGER,
    "senderName" TEXT,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "isAutomation" BOOLEAN NOT NULL DEFAULT false,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "isHumanReply" BOOLEAN NOT NULL DEFAULT false,
    "createdAtCw" TIMESTAMP(3),
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_events" (
    "id" BIGSERIAL NOT NULL,
    "conversationCwId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "actorType" TEXT,
    "actorId" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_intervals" (
    "id" BIGSERIAL NOT NULL,
    "conversationId" BIGINT NOT NULL,
    "conversationCwId" INTEGER NOT NULL,
    "assigneeCwId" INTEGER NOT NULL,
    "assigneeName" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "firstReplyAt" TIMESTAMP(3),
    "responseSeconds" INTEGER,
    "responded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "assignment_intervals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "response_metrics" (
    "id" BIGSERIAL NOT NULL,
    "conversationId" BIGINT NOT NULL,
    "conversationCwId" INTEGER NOT NULL,
    "assigneeCwId" INTEGER,
    "assignedAt" TIMESTAMP(3),
    "firstReplyAt" TIMESTAMP(3),
    "responseSeconds" INTEGER,
    "businessSeconds" INTEGER,
    "breachedSla" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "response_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resolution_intervals" (
    "id" BIGSERIAL NOT NULL,
    "conversationId" BIGINT NOT NULL,
    "conversationCwId" INTEGER NOT NULL,
    "segmentIndex" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "businessSeconds" INTEGER,

    CONSTRAINT "resolution_intervals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_sources" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_jobs" (
    "id" BIGSERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" TEXT,
    "status" TEXT,
    "statusBucket" TEXT,
    "operatorName" TEXT,
    "queueLabel" TEXT,
    "labelName" TEXT,
    "originalLabelName" TEXT,
    "templateName" TEXT,
    "inboxCwId" INTEGER,
    "inboxName" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "failedRecordsCount" INTEGER NOT NULL DEFAULT 0,
    "sentTrackCount" INTEGER NOT NULL DEFAULT 0,
    "deliveryFailuresCount" INTEGER NOT NULL DEFAULT 0,
    "createdAtApp" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "raw" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" BIGSERIAL NOT NULL,
    "campaignJobId" BIGINT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "status" TEXT,
    "conversationCwId" INTEGER,
    "messageCwId" INTEGER,
    "errorCode" TEXT,
    "errorDescription" TEXT,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_replies" (
    "id" BIGSERIAL NOT NULL,
    "conversationId" BIGINT NOT NULL,
    "conversationCwId" INTEGER NOT NULL,
    "campaignLabel" TEXT NOT NULL,
    "campaignSource" TEXT,
    "template" TEXT,
    "replyAt" TIMESTAMP(3),
    "firstAgentReplyAt" TIMESTAMP(3),
    "responseSeconds" INTEGER,
    "assigned" BOOLEAN NOT NULL DEFAULT false,
    "assigneeCwId" INTEGER,
    "assigneeName" TEXT,

    CONSTRAINT "campaign_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_handoffs" (
    "id" BIGSERIAL NOT NULL,
    "conversationId" BIGINT NOT NULL,
    "conversationCwId" INTEGER NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "handoffAt" TIMESTAMP(3) NOT NULL,
    "reentry" BOOLEAN NOT NULL DEFAULT false,
    "department" TEXT,
    "routedTeamCwId" INTEGER,
    "queuedUnassigned" BOOLEAN NOT NULL DEFAULT false,
    "gotAgentReply" BOOLEAN NOT NULL DEFAULT false,
    "firstAgentReplyAt" TIMESTAMP(3),
    "handoffToReplySeconds" INTEGER,

    CONSTRAINT "bot_handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" BIGSERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "params" JSONB,
    "stats" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "raw_events_dedupeKey_key" ON "raw_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "raw_events_source_event_idx" ON "raw_events"("source", "event");

-- CreateIndex
CREATE INDEX "raw_events_conversationCwId_idx" ON "raw_events"("conversationCwId");

-- CreateIndex
CREATE INDEX "raw_events_receivedAt_idx" ON "raw_events"("receivedAt");

-- CreateIndex
CREATE INDEX "contacts_phone_idx" ON "contacts"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_chatwootId_key" ON "conversations"("chatwootId");

-- CreateIndex
CREATE INDEX "conversations_status_idx" ON "conversations"("status");

-- CreateIndex
CREATE INDEX "conversations_department_idx" ON "conversations"("department");

-- CreateIndex
CREATE INDEX "conversations_assigneeCwId_idx" ON "conversations"("assigneeCwId");

-- CreateIndex
CREATE INDEX "conversations_teamCwId_idx" ON "conversations"("teamCwId");

-- CreateIndex
CREATE INDEX "conversations_inboxCwId_idx" ON "conversations"("inboxCwId");

-- CreateIndex
CREATE INDEX "conversations_lastMessageAt_idx" ON "conversations"("lastMessageAt");

-- CreateIndex
CREATE INDEX "conversations_createdAtCw_idx" ON "conversations"("createdAtCw");

-- CreateIndex
CREATE INDEX "conversations_isCampaign_idx" ON "conversations"("isCampaign");

-- CreateIndex
CREATE INDEX "conversations_needsReply_idx" ON "conversations"("needsReply");

-- CreateIndex
CREATE INDEX "conversations_campaignLabel_idx" ON "conversations"("campaignLabel");

-- CreateIndex
CREATE UNIQUE INDEX "messages_chatwootId_key" ON "messages"("chatwootId");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAtCw_idx" ON "messages"("conversationId", "createdAtCw");

-- CreateIndex
CREATE INDEX "messages_conversationCwId_idx" ON "messages"("conversationCwId");

-- CreateIndex
CREATE INDEX "messages_messageType_idx" ON "messages"("messageType");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_events_dedupeKey_key" ON "conversation_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "conversation_events_conversationCwId_occurredAt_idx" ON "conversation_events"("conversationCwId", "occurredAt");

-- CreateIndex
CREATE INDEX "conversation_events_type_idx" ON "conversation_events"("type");

-- CreateIndex
CREATE INDEX "assignment_intervals_assigneeCwId_startedAt_idx" ON "assignment_intervals"("assigneeCwId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_intervals_conversationCwId_assigneeCwId_startedA_key" ON "assignment_intervals"("conversationCwId", "assigneeCwId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "response_metrics_conversationCwId_key" ON "response_metrics"("conversationCwId");

-- CreateIndex
CREATE INDEX "response_metrics_assigneeCwId_idx" ON "response_metrics"("assigneeCwId");

-- CreateIndex
CREATE INDEX "resolution_intervals_resolvedAt_idx" ON "resolution_intervals"("resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "resolution_intervals_conversationCwId_segmentIndex_key" ON "resolution_intervals"("conversationCwId", "segmentIndex");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_sources_key_key" ON "campaign_sources"("key");

-- CreateIndex
CREATE INDEX "campaign_jobs_sourceKey_createdAtApp_idx" ON "campaign_jobs"("sourceKey", "createdAtApp");

-- CreateIndex
CREATE INDEX "campaign_jobs_labelName_idx" ON "campaign_jobs"("labelName");

-- CreateIndex
CREATE INDEX "campaign_jobs_operatorName_idx" ON "campaign_jobs"("operatorName");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_jobs_sourceKey_jobId_key" ON "campaign_jobs"("sourceKey", "jobId");

-- CreateIndex
CREATE INDEX "campaign_recipients_conversationCwId_idx" ON "campaign_recipients"("conversationCwId");

-- CreateIndex
CREATE INDEX "campaign_recipients_sourceKey_jobId_idx" ON "campaign_recipients"("sourceKey", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaignJobId_phone_key" ON "campaign_recipients"("campaignJobId", "phone");

-- CreateIndex
CREATE INDEX "campaign_replies_campaignSource_idx" ON "campaign_replies"("campaignSource");

-- CreateIndex
CREATE INDEX "campaign_replies_campaignLabel_idx" ON "campaign_replies"("campaignLabel");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_replies_conversationCwId_campaignLabel_key" ON "campaign_replies"("conversationCwId", "campaignLabel");

-- CreateIndex
CREATE UNIQUE INDEX "bot_handoffs_dedupeKey_key" ON "bot_handoffs"("dedupeKey");

-- CreateIndex
CREATE INDEX "bot_handoffs_department_idx" ON "bot_handoffs"("department");

-- CreateIndex
CREATE INDEX "bot_handoffs_handoffAt_idx" ON "bot_handoffs"("handoffAt");

-- CreateIndex
CREATE INDEX "sync_runs_type_startedAt_idx" ON "sync_runs"("type", "startedAt");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_intervals" ADD CONSTRAINT "assignment_intervals_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_metrics" ADD CONSTRAINT "response_metrics_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolution_intervals" ADD CONSTRAINT "resolution_intervals_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_jobs" ADD CONSTRAINT "campaign_jobs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "campaign_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaignJobId_fkey" FOREIGN KEY ("campaignJobId") REFERENCES "campaign_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_replies" ADD CONSTRAINT "campaign_replies_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_handoffs" ADD CONSTRAINT "bot_handoffs_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

