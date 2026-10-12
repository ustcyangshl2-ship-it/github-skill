ALTER TYPE "ResourceType" ADD VALUE 'UNKNOWN';
ALTER TABLE "Skill" ALTER COLUMN "difficulty" DROP NOT NULL;
ALTER TABLE "GithubRepository" ADD COLUMN "readmeEtag" TEXT, ADD COLUMN "readmeExcerpt" TEXT, ADD COLUMN "readmeState" TEXT NOT NULL DEFAULT 'NOT_FETCHED', ADD COLUMN "readmeFetchedAt" TIMESTAMP(3), ADD COLUMN "syncEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CollectionTask" ADD COLUMN "requestKey" TEXT, ADD COLUMN "leaseToken" TEXT, ADD COLUMN "searchComplete" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "discoveredCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "processedCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "createdCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "updatedCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "unchangedCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "failedCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "pagesFetched" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 5, ADD COLUMN "finishedAt" TIMESTAMP(3);
UPDATE "CollectionTask" SET "requestKey" = "dedupeKey";
ALTER TABLE "CollectionTask" ALTER COLUMN "requestKey" SET NOT NULL;
ALTER TABLE "GithubRepository" ADD COLUMN "contentVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CollectionTask" ADD COLUMN "stepAttempts" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "collection_task_active_request" ON "CollectionTask" ("requestKey") WHERE "status" IN ('QUEUED','RUNNING');
ALTER TABLE "CollectionTask" ADD CONSTRAINT "collector_progress_nonnegative" CHECK ("discoveredCount">=0 AND "processedCount">=0 AND "createdCount">=0 AND "updatedCount">=0 AND "unchangedCount">=0 AND "failedCount">=0 AND "pagesFetched">=0 AND "maxAttempts" BETWEEN 1 AND 10);
CREATE TABLE "CollectionTaskItem" (
  "id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "githubId" BIGINT, "url" TEXT NOT NULL, "status" "TaskStatus" NOT NULL DEFAULT 'QUEUED', "attempts" INTEGER NOT NULL DEFAULT 0, "errorCode" TEXT, "result" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollectionTaskItem_pkey" PRIMARY KEY ("id"), CONSTRAINT "item_attempts_nonnegative" CHECK ("attempts">=0), CONSTRAINT "CollectionTaskItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CollectionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CollectionTaskItem_taskId_url_key" ON "CollectionTaskItem"("taskId","url");
CREATE UNIQUE INDEX "CollectionTaskItem_taskId_githubId_key" ON "CollectionTaskItem"("taskId","githubId");
CREATE INDEX "CollectionTaskItem_taskId_status_createdAt_idx" ON "CollectionTaskItem"("taskId","status","createdAt");
CREATE TABLE "CollectorRuntime" (
  "id" TEXT NOT NULL, "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "nextRequestAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "pausedUntil" TIMESTAMP(3), "pauseReason" TEXT, "lastHeartbeatAt" TIMESTAMP(3), CONSTRAINT "CollectorRuntime_pkey" PRIMARY KEY ("id")
);
-- Daily snapshots use China business dates. Do not invent a second day from UTC midnight.
DELETE FROM "RepositorySnapshot" WHERE "id" IN (SELECT "id" FROM (SELECT "id", row_number() OVER (PARTITION BY "repositoryId", ("fetchedAt" AT TIME ZONE 'Asia/Shanghai')::date ORDER BY "fetchedAt" DESC, "id") AS n FROM "RepositorySnapshot") q WHERE n>1);
UPDATE "RepositorySnapshot" SET "day"=("fetchedAt" AT TIME ZONE 'Asia/Shanghai')::date;
