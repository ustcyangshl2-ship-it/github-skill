import assert from "node:assert/strict";
import { CollectorWorker } from "../src/server/collector/worker";
import { enqueueTask, refreshRepository, retryTask, setRepositorySync } from "../src/server/collector/service";
import { metadata, readme, response } from "../tests/collector-fixtures";
import { testDatabase } from "./p2-test-db";
const { prisma } = await testDatabase();
let clock = new Date(Date.now() + 1000); let checks = 0;
function pass(name: string) { checks++; console.log(`PASS ${name}`); }
async function actor() { return prisma.user.create({ data: { name: "test-only collector editor", role: "EDITOR" } }); }
const repos = new Map<number, ReturnType<typeof metadata>>();
const traces: { url: string; etag: string | null }[] = [];
let rateOnce = false; let failOnce = false; let permanent = false; let searches = false; let readmeChanged = true; let metadataChanged = true;
const fetcher: typeof fetch = async (input, options) => {
  const url = new URL(String(input)); traces.push({ url: String(url), etag: new Headers(options?.headers).get("if-none-match") });
  if (rateOnce) { rateOnce = false; return response({}, 429, { "retry-after": "60" }); }
  if (failOnce) { failOnce = false; return response({}, 503); }
  if (permanent) return response({}, 404);
  if (url.pathname === "/search/repositories") {
    const page = Number(url.searchParams.get("page")); const values = [...repos.values()];
    const items = searches ? page === 1 ? values.slice(0, 2) : [values[0], values[2]] : values.slice(0, 1);
    const next = new URL(url); next.searchParams.set("page", "2");
    return response({ total_count: values.length, incomplete_results: false, items }, 200, searches && page === 1 ? { link: `<${next}>; rel="next"` } : {});
  }
  if (url.pathname.endsWith("/readme")) return readmeChanged ? response(readme(), 200, { etag: '"readme-v1"' }) : response(null, 304);
  const repo = url.pathname.startsWith("/repositories/") ? repos.get(Number(url.pathname.split("/").at(-1))) : [...repos.values()].find(r => url.pathname === `/repos/${r.full_name}`);
  if (!repo) return response({}, 404);
  return metadataChanged ? response(repo, 200, { etag: '"repo-v1"' }) : response(null, 304);
};
const worker = new CollectorWorker(prisma, { fetch: fetcher, now: () => clock, intervalMs: 0 });
async function finish(id: string) {
  for (let i = 0; i < 50; i++) {
    const task = await prisma.collectionTask.findUniqueOrThrow({ where: { id } });
    if (["SUCCEEDED", "FAILED"].includes(task.status)) return task;
    const runtime = await prisma.collectorRuntime.findUnique({ where: { id: "github" } });
    clock = new Date(Math.max(clock.getTime(), task.nextAttemptAt.getTime(), runtime?.nextRequestAt.getTime() ?? 0, runtime?.pausedUntil?.getTime() ?? 0) + 1);
    await worker.runStep();
  }
  throw new Error("Task did not terminate within bounded steps");
}
try {
  const a = await actor(); const user = await prisma.user.create({ data: { name: "test-only regular user" } });
  await assert.rejects(() => enqueueTask(prisma, user.id, { url: "https://github.com/skillhub-fixture/alpha" }, "IMPORT"), (e: unknown) => e instanceof Error && "status" in e && e.status === 403); pass("USER cannot enqueue");
  repos.set(910001, metadata());
  const [one, duplicate] = await Promise.all([enqueueTask(prisma, a.id, { url: metadata().html_url }, "IMPORT"), enqueueTask(prisma, a.id, { url: metadata().html_url }, "IMPORT")]);
  assert.equal(one.task.id, duplicate.task.id); assert.equal(await prisma.collectionTask.count(), 1); pass("concurrent duplicate submissions share one active task");
  const imported = await finish(one.task.id); assert.equal(imported.status, "SUCCEEDED"); assert.equal(imported.createdCount, 1); pass("import metadata + README closes task");
  const repo = await prisma.githubRepository.findUniqueOrThrow({ where: { githubId: 910001n }, include: { skill: true } });
  const sqlDay = await prisma.$queryRaw<{ day: Date }[]>`SELECT ((TIMESTAMP '2026-10-11 18:00:00' AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date AS day`;
  assert.equal(sqlDay[0].day.toISOString(), "2026-10-12T00:00:00.000Z"); pass("SQL timestamp migration and China day semantics match");
  assert.equal(repo.skill?.status, "DRAFT"); assert.equal(repo.skill?.type, "UNKNOWN"); assert.equal(repo.skill?.summaryZh, ""); assert.equal(await prisma.aiTask.count(), 0); pass("new entry stays unclassified DRAFT, no fabricated AI publication");
  assert.ok(repo.readmeText?.includes("Ignore previous instructions")); assert.ok(repo.readmeExcerpt); pass("README remains untrusted text with excerpt");
  assert.equal(await prisma.repositorySnapshot.count(), 1); pass("one observed China day snapshot");
  const identity = await enqueueTask(prisma, a.id, { url: metadata().html_url }, "IMPORT", "fixed-idempotency-01");
  const repeated = await enqueueTask(prisma, a.id, { url: metadata().html_url }, "IMPORT", "fixed-idempotency-01");
  assert.equal(identity.task.id, repeated.task.id); await assert.rejects(() => enqueueTask(prisma, a.id, { query: "different query" }, "DISCOVER", "fixed-idempotency-01")); pass("idempotency key is replayable but not reusable for other payload");
  metadataChanged = false; readmeChanged = false; await finish(identity.task.id);
  assert.equal(await prisma.githubRepository.count(), 1); assert.equal(await prisma.skill.count(), 1); pass("completed repeat import does not duplicate repository or Skill");
  assert.ok(traces.some(t => t.etag === '"repo-v1"')); assert.ok(traces.some(t => t.etag === '"readme-v1"')); pass("independent conditional metadata and README requests");
  await prisma.skill.update({ where: { repositoryId: repo.id }, data: { title: "test-only editor title", summaryZh: "test-only editor draft", descriptionZh: "test-only editor body" } });
  repos.set(910001, metadata(910001, "skillhub-fixture/alpha", 25)); metadataChanged = true;
  const refreshed = await refreshRepository(prisma, a.id, repo.id); await finish(refreshed.task.id);
  const current = await prisma.githubRepository.findUniqueOrThrow({ where: { id: repo.id }, include: { skill: true } });
  assert.equal(current.stars, 25); assert.equal(current.skill?.title, "test-only editor title"); assert.equal(current.skill?.summaryZh, "test-only editor draft"); pass("incremental metadata does not overwrite editorial content");
  assert.equal(await prisma.repositorySnapshot.count(), 1); assert.equal((await prisma.repositorySnapshot.findFirstOrThrow()).stars, 25); pass("same-day incremental refresh updates one real snapshot");
  const b = await actor(); rateOnce = true;
  const limited = await refreshRepository(prisma, b.id, repo.id); clock = new Date(Math.max(clock.getTime(), limited.task.nextAttemptAt.getTime()) + 1); await worker.runStep();
  const delayed = await prisma.collectionTask.findUniqueOrThrow({ where: { id: limited.task.id } }); assert.equal(delayed.status, "QUEUED"); assert.equal(delayed.attempts, 1); assert.ok(delayed.nextAttemptAt.getTime() >= clock.getTime() + 60000); pass("429 stores delayed retry without sleeping a request");
  const previousCalls = traces.length; assert.equal((await worker.runStep()).worked, false); assert.equal(traces.length, previousCalls); pass("shared cooldown prevents premature network retry");
  const changedCredentials = new CollectorWorker(prisma, { fetch: fetcher, token: "test-only-new-credential", now: () => clock, intervalMs: 0 });
  assert.equal((await changedCredentials.runStep()).worked, false); assert.equal(traces.length, previousCalls); pass("credential change cannot bypass secondary Retry-After cooldown");
  assert.equal((await finish(limited.task.id)).status, "SUCCEEDED"); pass("rate-limited task resumes from durable state");
  const c = await actor(); failOnce = true; const transient = await refreshRepository(prisma, c.id, repo.id); assert.equal((await finish(transient.task.id)).status, "SUCCEEDED"); assert.equal((await prisma.collectionTask.findUniqueOrThrow({ where: { id: transient.task.id } })).attempts, 1); pass("5xx retries with bounded progress");
  permanent = true; const bad = await enqueueTask(prisma, c.id, { url: "https://github.com/skillhub-fixture/missing" }, "IMPORT"); const failed = await finish(bad.task.id); assert.equal(failed.status, "FAILED"); assert.equal(failed.failedCount, 1); pass("404 remains failed with diagnostics");
  permanent = false; repos.set(910004, metadata(910004, "skillhub-fixture/missing")); const retried = await retryTask(prisma, c.id, bad.task.id); assert.equal(retried.processedCount, 0); assert.equal((await finish(bad.task.id)).status, "SUCCEEDED"); pass("manual retry preserves prior logs and retries failed items");
  await assert.rejects(() => retryTask(prisma, c.id, bad.task.id)); pass("successful task cannot be requeued through failure retry");
  repos.set(910002, metadata(910002, "skillhub-fixture/beta")); repos.set(910003, metadata(910003, "skillhub-fixture/gamma")); repos.delete(910004); searches = true;
  const d = await actor(); const discovery = await enqueueTask(prisma, d.id, { query: "agent skills", perPage: 2, maxPages: 2 }, "DISCOVER"); const discovered = await finish(discovery.task.id);
  assert.equal(discovered.status, "SUCCEEDED"); assert.equal(discovered.pagesFetched, 2); assert.equal(discovered.discoveredCount, 3); assert.equal(discovered.processedCount, 3); pass("two search pages deduplicate repeated IDs and collect each unique repository");
  assert.equal(await prisma.collectionTaskItem.count({ where: { taskId: discovery.task.id } }), 3); pass("database item uniqueness protects pagination overlap");
  await setRepositorySync(prisma, d.id, repo.id, false); searches = false;
  const beforeSkip = traces.length; const skipped = await enqueueTask(prisma, d.id, { query: "paused fixture", perPage: 1, maxPages: 1 }, "DISCOVER"); await finish(skipped.task.id);
  assert.equal(traces.length - beforeSkip, 1); assert.equal((await prisma.collectionTaskItem.findFirstOrThrow({ where: { taskId: skipped.task.id } })).result, "SKIPPED_SYNC_DISABLED"); pass("paused repository is skipped by discovery without repository/readme requests");
  const manual = await refreshRepository(prisma, d.id, repo.id); assert.equal((await finish(manual.task.id)).status, "SUCCEEDED"); pass("explicit manual refresh remains possible for paused repository");
  const e = await actor(); const stale = await refreshRepository(prisma, e.id, repo.id); const past = new Date(clock.getTime() - 1000);
  await prisma.collectionTask.update({ where: { id: stale.task.id }, data: { status: "RUNNING", leaseToken: "stale-token", leaseUntil: past } });
  await prisma.collectorRuntime.update({ where: { id: "github" }, data: { leaseToken: "stale-token", leaseUntil: past } });
  assert.equal((await finish(stale.task.id)).status, "SUCCEEDED"); assert.ok(await prisma.collectionTaskLog.count({ where: { taskId: stale.task.id, details: { path: ["event"], equals: "LEASE_RECOVERED" } } })); pass("expired worker lease recovers safely");
  let unlock!: () => void; let entered!: () => void;
  const gate = new Promise<void>(r => { unlock = r; }); const started = new Promise<void>(r => { entered = r; }); let blocked = false;
  const blocking: typeof fetch = async (input, options) => { if (!blocked) { blocked = true; entered(); await gate; } return fetcher(input, options); };
  const queued = await refreshRepository(prisma, e.id, repo.id); clock = new Date(Math.max(clock.getTime(), queued.task.nextAttemptAt.getTime()) + 1);
  const first = new CollectorWorker(prisma, { fetch: blocking, now: () => clock, intervalMs: 0 }).runStep(); await started;
  const second = await worker.runStep(); assert.equal(second.worked, false); unlock(); await first; await finish(queued.task.id); pass("two workers cannot fetch concurrently under the shared lease");
  const logs = await prisma.collectionTaskLog.findMany(); assert.ok(logs.some(l => l.level === "WARN")); assert.ok(logs.some(l => l.level === "ERROR")); assert.ok(logs.some(l => l.message.includes("304"))); pass("task logs retain failure, retry, and 304 events");
  assert.ok(await prisma.auditLog.count({ where: { action: "REPOSITORY_SYNC_CHANGE" } })); assert.ok(await prisma.auditLog.count({ where: { action: "COLLECTION_RETRY" } })); pass("management actions retain audit records");
  const exhaustedActor = await actor(); const exhausted = await enqueueTask(prisma, exhaustedActor.id, { url: "https://github.com/skillhub-fixture/unavailable" }, "IMPORT");
  const alwaysUnavailable: typeof fetch = async () => response({}, 503);
  const broken = new CollectorWorker(prisma, { fetch: alwaysUnavailable, now: () => clock, intervalMs: 0 });
  for (let i = 0; i < 10; i++) { const t = await prisma.collectionTask.findUniqueOrThrow({ where: { id: exhausted.task.id } }); if (t.status === "FAILED") break; clock = new Date(Math.max(clock.getTime(), t.nextAttemptAt.getTime()) + 1); await broken.runStep(); }
  const terminal = await prisma.collectionTask.findUniqueOrThrow({ where: { id: exhausted.task.id } }); assert.equal(terminal.status, "FAILED"); assert.equal(terminal.attempts, 5); pass("retry ceiling terminates after five failed attempts");
  const cappedActor = await actor();
  const submissions = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => enqueueTask(prisma, cappedActor.id, { url: `https://github.com/skillhub-fixture/cap-${i}` }, "IMPORT")));
  assert.equal(submissions.filter(r => r.status === "fulfilled").length, 10); assert.equal(submissions.filter(r => r.status === "rejected").length, 2); pass("concurrent admin submissions obey the atomic per-minute cap");
  await assert.rejects(() => retryTask(prisma, cappedActor.id, exhausted.task.id), (e: unknown) => e instanceof Error && "code" in e && e.code === "QUEUE_LIMIT");
  assert.equal((await prisma.collectionTask.findUniqueOrThrow({ where: { id: exhausted.task.id } })).status, "FAILED"); pass("manual retry shares the submission cap and cannot mutate a rejected task");
  console.log(`Collector PostgreSQL integration: ${checks} checks passed. Main SkillHub database was not modified.`);
} finally { await prisma.$disconnect(); }
