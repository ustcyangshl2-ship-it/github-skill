-- Metadata-only public entries are allowed. Chinese enrichment requires human review.
ALTER TABLE "Skill" DROP CONSTRAINT "published_skill_content";

-- Move only the original P1 initialization drafts, never reviewer-edited content.
INSERT INTO "AiTask" ("id", "skillId", "status", "dedupeKey", "inputHash", "sourceVersion", "provider", "model", "promptVersion", "result", "updatedAt")
SELECT 'p1-draft-' || s."id", s."id", 'PENDING_REVIEW', 'p1-content-draft:' || s."id", 'github:' || r."githubId"::text || ':' || r."sourceUpdatedAt"::text, s."version", 'initialization-draft', 'code-assistant-draft-not-runtime-api', 'p1-seed-v1',
  jsonb_build_object('type', s."type", 'summaryZh', s."summaryZh", 'difficulty', s."difficulty", 'audience', s."audience", 'scenarios', s."scenarios", 'categorySlugs', coalesce((SELECT jsonb_agg(c."slug") FROM "SkillCategory" sc JOIN "Category" c ON c."id"=sc."categoryId" WHERE sc."skillId"=s."id"), '[]'::jsonb), 'tags', coalesce((SELECT jsonb_agg(t."name") FROM "SkillTag" st JOIN "Tag" t ON t."id"=st."tagId" WHERE st."skillId"=s."id"), '[]'::jsonb), 'preliminaryScore', NULL, 'reasoning', '初始化中文草稿，尚未经过人工审核；不是运行时模型API调用结果，没有项目实测证据，不提供质量分。'), now()
FROM "Skill" s JOIN "GithubRepository" r ON r."id"=s."repositoryId"
WHERE s."version"=1 AND s."authorId" IS NULL AND s."reviewerId" IS NULL AND s."reviewedAt" IS NULL AND length(trim(s."summaryZh"))>0
  AND s."slug" IN ('anthropic-skills','superpowers','vercel-agent-skills','markitdown','lightrag','dify','open-webui','n8n')
ON CONFLICT ("dedupeKey") DO NOTHING;
UPDATE "Skill" s SET "summaryZh"='', "descriptionZh"='', "audience"='{}', "scenarios"='{}'
WHERE s."version"=1 AND s."authorId" IS NULL AND s."reviewerId" IS NULL AND s."reviewedAt" IS NULL
  AND EXISTS (SELECT 1 FROM "AiTask" a WHERE a."dedupeKey"='p1-content-draft:' || s."id" AND a."status"='PENDING_REVIEW');

ALTER TABLE "Skill" ADD CONSTRAINT "published_skill_timestamp" CHECK ("status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL);
ALTER TABLE "Skill" ADD CONSTRAINT "public_enrichment_requires_review" CHECK ("status" <> 'PUBLISHED' OR ((length(trim("summaryZh")) = 0 AND length(trim("descriptionZh")) = 0 AND cardinality("audience") = 0 AND cardinality("scenarios") = 0) OR ("reviewerId" IS NOT NULL AND "reviewedAt" IS NOT NULL)));
