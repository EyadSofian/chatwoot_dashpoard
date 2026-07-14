-- Chatwoot labels.
-- Additive: one new table. Conversations already carry their label titles in
-- `conversations.labels` (text[]), so nothing about existing rows changes — this
-- just gives the labels a roster of their own, the way agents and teams have one,
-- so a label with no conversations this period still shows up at zero.

-- CreateTable
CREATE TABLE "labels" (
    "id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "showOnSidebar" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "labels_title_key" ON "labels"("title");
