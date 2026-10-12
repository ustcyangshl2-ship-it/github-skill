-- Prisma DateTime is stored as UTC timestamp without time zone. Convert UTC -> China explicitly.
DELETE FROM "RepositorySnapshot" WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (PARTITION BY "repositoryId", (("fetchedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date ORDER BY "fetchedAt" DESC, "id") AS n
    FROM "RepositorySnapshot"
  ) q WHERE n>1
);
UPDATE "RepositorySnapshot" SET "day"=(("fetchedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date;
