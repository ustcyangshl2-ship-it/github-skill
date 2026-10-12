import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chinaSnapshotDay, enqueueTask, refreshRepository, retryTask } from "../src/server/collector/service";
import { CollectorWorker } from "../src/server/collector/worker";
const url = new URL(process.env.DATABASE_URL!);
assert.ok(url.hostname === "127.0.0.1" && url.port === "55432" && url.pathname === "/skillhub", "Live smoke is restricted to the local SkillHub database");
const prisma = new PrismaClient(); const worker = new CollectorWorker(prisma, { token: process.env.GITHUB_TOKEN });
let actorId = "";
type Receipt = { importId?: string; refreshId?: string; discoveryId?: string };
let previous: Receipt = {};
try { previous = JSON.parse(await readFile(".local/collector-live.json", "utf8")); } catch { /* first run */ }
async function settle(id: string) {
  for (let i = 0; i < 30; i++) {
    const task = await prisma.collectionTask.findUniqueOrThrow({ where: { id } });
    if (["SUCCEEDED", "FAILED"].includes(task.status)) return task;
    const result = await worker.runStep();
    if (!result.worked) {
      const runtime = await prisma.collectorRuntime.findUnique({ where: { id: "github" } });
      const wait = Math.max(task.nextAttemptAt.getTime(), runtime?.nextRequestAt.getTime() ?? 0, runtime?.pausedUntil?.getTime() ?? 0) - Date.now();
      if (wait > 15000) return task;
      await new Promise(resolve => setTimeout(resolve, Math.max(wait + 100, 500)));
    }
  }
  return prisma.collectionTask.findUniqueOrThrow({ where: { id } });
}
try {
  const actor = await prisma.user.create({ data: { name: "临时采集验收操作员（CLI）", role: "ADMIN" } }); actorId = actor.id;
  let imported = previous.importId ? await prisma.collectionTask.findUnique({ where: { id: previous.importId } }) : null;
  if (!imported) imported = (await enqueueTask(prisma, actor.id, { url: "https://github.com/github/spec-kit" }, "IMPORT")).task;
  if (imported.status === "FAILED") imported = await retryTask(prisma, actor.id, imported.id);
  await settle(imported.id);
  const repo = await prisma.githubRepository.findFirst({ where: { fullName: { equals: "github/spec-kit", mode: "insensitive" } } });
  let refreshed = previous.refreshId ? await prisma.collectionTask.findUnique({ where: { id: previous.refreshId } }) : null;
  if (repo && !refreshed) refreshed = (await refreshRepository(prisma, actor.id, repo.id)).task;
  if (refreshed) { if (refreshed.status === "FAILED") await retryTask(prisma, actor.id, refreshed.id); await settle(refreshed.id); }
  let discovery = previous.discoveryId ? await prisma.collectionTask.findUnique({ where: { id: previous.discoveryId } }) : null;
  if (!discovery) discovery = (await enqueueTask(prisma, actor.id, { query: "agent-skills in:name", perPage: 1, maxPages: 2, minStars: 0 }, "DISCOVER")).task;
  if (discovery.status === "FAILED") await retryTask(prisma, actor.id, discovery.id);
  await settle(discovery.id);
  const ids = { importId: imported.id, refreshId: refreshed?.id, discoveryId: discovery.id };
  const tasks = await prisma.collectionTask.findMany({ where: { id: { in: Object.values(ids).filter((x): x is string => Boolean(x)) } }, include: { items: { select: { githubId: true, status: true, result: true, url: true } }, logs: { orderBy: { createdAt: "asc" }, select: { level: true, message: true, details: true, createdAt: true } } } });
  const runtime = await prisma.collectorRuntime.findUnique({ where: { id: "github" } });
  const sourceIds = [...new Set(tasks.flatMap(t => t.items.flatMap(i => i.githubId ? [i.githubId] : [])))];
  const sources = await prisma.githubRepository.findMany({ where: { githubId: { in: sourceIds } }, include: { skill: { select: { status: true, type: true } }, snapshots: { where: { day: chinaSnapshotDay(new Date()) } } } });
  const report = { ...ids, checkedAt: new Date().toISOString(), transport: "direct GitHub REST fetch", authenticated: Boolean(process.env.GITHUB_TOKEN), repositories: sources.map(r => ({ githubId: r.githubId.toString(), fullName: r.fullName, url: r.url, stars: r.stars, forks: r.forks, licenseSpdx: r.licenseSpdx, fetchedAt: r.fetchedAt, readmeState: r.readmeState, readmeBytes: Buffer.byteLength(r.readmeText ?? "", "utf8"), metadataEtagPresent: Boolean(r.etag), readmeEtagPresent: Boolean(r.readmeEtag), skillStatus: r.skill?.status, skillType: r.skill?.type, todaySnapshots: r.snapshots.length })), tasks: tasks.map(t => ({ id: t.id, kind: t.kind, status: t.status, discoveredCount: t.discoveredCount, processedCount: t.processedCount, createdCount: t.createdCount, updatedCount: t.updatedCount, unchangedCount: t.unchangedCount, pagesFetched: t.pagesFetched, errorCode: t.errorCode, nextAttemptAt: t.nextAttemptAt, items: t.items.map(i => ({ ...i, githubId: i.githubId?.toString() })), logs: t.logs })), pausedUntil: runtime?.pausedUntil, pauseReason: runtime?.pauseReason };
  await mkdir(".local", { recursive: true }); await writeFile(".local/collector-live.json", JSON.stringify(report, null, 2));
  for (const task of report.tasks) console.log(`${task.kind}: ${task.status}; ${task.id}; processed=${task.processedCount}; error=${task.errorCode ?? "none"}`);
  const success = report.tasks.length === 3 && report.tasks.every(t => t.status === "SUCCEEDED") && report.tasks.find(t => t.kind === "DISCOVER")?.pagesFetched === 2;
  if (!success) { console.log("Live closure is pending: see durable task state and retry time. No success has been fabricated."); process.exitCode = 2; }
  else {
    assert.ok(repo?.readmeText);
    assert.equal(sources.length, sourceIds.length, "GitHub IDs resolve to unique persisted repositories");
    for (const source of sources) { assert.ok(source.readmeText); assert.equal(source.skill?.status, "DRAFT"); assert.equal(source.skill.type, "UNKNOWN"); assert.equal(source.snapshots.length, 1, "Import and refresh reuse the China-day snapshot"); }
    console.log("PASS real import, refresh, and two-page discovery completed; unique IDs, README, daily snapshots, and DRAFT/UNKNOWN boundaries verified.");
  }
} finally { if (actorId) { await prisma.user.delete({ where: { id: actorId } }); assert.equal(await prisma.user.count({ where: { id: actorId } }), 0, "Temporary live-smoke actor is removed"); } await prisma.$disconnect(); }
