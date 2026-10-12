import "dotenv/config";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
const databaseUrl = new URL(process.env.DATABASE_URL!);
assert.ok(databaseUrl.hostname === "127.0.0.1" && databaseUrl.port === "55432" && databaseUrl.pathname === "/skillhub", "Integration fixtures may only run against the dedicated local SkillHub database");
const prisma = new PrismaClient();
let checks = 0;
function pass(label: string) { checks++; console.log(`PASS ${label}`); }
async function rejects(label: string, action: () => Promise<unknown>) { await assert.rejects(action); pass(label); }
try {
  const before = { repositories: await prisma.githubRepository.count(), skills: await prisma.skill.count(), collections: await prisma.collection.count(), tutorials: await prisma.tutorial.count(), snapshots: await prisma.repositorySnapshot.count(), aiDrafts: await prisma.aiTask.count() };
  assert.ok(before.repositories >= 8); assert.ok(before.skills >= 8); pass("real seed count");
  const seed = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"], { encoding: "utf8", env: process.env });
  assert.equal(seed.status, 0, seed.stderr);
  const after = { repositories: await prisma.githubRepository.count(), skills: await prisma.skill.count(), collections: await prisma.collection.count(), tutorials: await prisma.tutorial.count(), snapshots: await prisma.repositorySnapshot.count(), aiDrafts: await prisma.aiTask.count() };
  assert.deepEqual(after, before); pass("idempotent seed preserves row counts");
  assert.equal(await prisma.review.count(), 0); assert.equal(await prisma.user.count(), 0); pass("no fabricated reviews/users");
  const repo = await prisma.githubRepository.findFirstOrThrow();
  const skill = await prisma.skill.findFirstOrThrow();
  await rejects("negative stars rejected", () => prisma.githubRepository.update({ where: { id: repo.id }, data: { stars: -1 } }));
  await rejects("GitHub ID deduplication", () => prisma.githubRepository.create({ data: { githubId: repo.githubId, fullName: "test-only/duplicate", url: "https://github.com/test-only/duplicate", topics: [], sourceUpdatedAt: new Date() } }));
  await rejects("foreign key blocks unknown favorite owner", () => prisma.favorite.create({ data: { userId: "missing-user", skillId: skill.id } }));
  await rejects("unproven verification rejected", () => prisma.review.create({ data: { skillId: skill.id, title: "test-only", body: "test-only", verification: "VERIFIED" } }));
  await rejects("score out of range rejected", () => prisma.review.create({ data: { skillId: skill.id, title: "test-only", body: "test-only", score: 101 } }));
  await rejects("unreviewed public Chinese enrichment rejected", () => prisma.skill.update({ where: { id: skill.id }, data: { summaryZh: "未经人工审核的中文草稿" } }));
  assert.equal(await prisma.aiTask.count({ where: { status: "PENDING_REVIEW" } }), 8);
  assert.equal(await prisma.skill.count({ where: { status: "PUBLISHED", summaryZh: { not: "" } } }), 0); pass("eight AI drafts are queued, none published");
  await rejects("invalid membership duration rejected", () => prisma.$transaction(async tx => {
    const user = await tx.user.create({ data: { email: "test-only@example.invalid" } });
    assert.equal(user.role, "USER");
    await tx.membershipGrant.create({ data: { userId: user.id, startsAt: new Date("2026-10-13"), expiresAt: new Date("2026-10-12"), source: "test-only" } });
  }));
  assert.equal(await prisma.user.count(), 0); pass("failed membership transaction rolled back user");
  const invalidFavorites = await prisma.favorite.count(); assert.equal(invalidFavorites, 0); pass("failed writes left no test data");
  console.log(`Database integration: ${checks} checks passed.`);
} finally { await prisma.$disconnect(); }
