import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { testDatabase } from "./p2-test-db";
import { CollectorWorker } from "../src/server/collector/worker";
import { metadata, readme, response } from "../tests/collector-fixtures";
const { prisma, url } = await testDatabase();
const base = "http://127.0.0.1:3301";
const server = spawn(process.execPath, [".next/standalone/server.js"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, DATABASE_URL: url, NEXTAUTH_URL: base, NEXTAUTH_SECRET: "test-only-local-session-secret-not-production", PORT: "3301", HOSTNAME: "127.0.0.1" } });
server.stderr.on("data", data => { const value = data.toString(); if (!value.includes("[SkillHub]")) process.stderr.write(value); });
let checks = 0;
async function call(path: string, status = 200, cookie = "", body?: unknown, method = "GET", origin = base, key?: string) {
  const r = await fetch(`${base}${path}`, { method, redirect: "manual", headers: { Cookie: cookie, Origin: origin, ...(body !== undefined && { "Content-Type": "application/json" }), ...(key && { "Idempotency-Key": key }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
  assert.equal(r.status, status, `${method} ${path}`); checks++; console.log(`PASS ${status} ${method} ${path}`); return r;
}
async function session(role: "USER" | "EDITOR" | "ADMIN") {
  const user = await prisma.user.create({ data: { name: `test-only ${role}`, role } }); const token = randomUUID();
  await prisma.session.create({ data: { userId: user.id, sessionToken: token, expires: new Date(Date.now() + 3600000) } });
  return { user, cookie: `next-auth.session-token=${token}` };
}
try {
  let ready = false;
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch { /* boot */ } await new Promise(r => setTimeout(r, 250)); }
  assert.ok(ready, "Standalone test server did not become ready");
  const ordinary = await session("USER"); const editor = await session("EDITOR"); const admin = await session("ADMIN");
  await call("/api/v1/admin/repositories", 401);
  await call("/api/v1/admin/repositories", 403, ordinary.cookie);
  await call("/admin/repositories", 307);
  await call("/admin/repositories", 307, ordinary.cookie);
  const html = await (await call("/admin/repositories", 200, editor.cookie)).text(); assert.ok(html.includes("导入 GitHub 仓库")); assert.ok(html.includes("按关键词发现"));
  await call("/api/v1/admin/repositories/import", 403, editor.cookie, { url: metadata().html_url }, "POST", "https://evil.example");
  await call("/api/v1/admin/repositories/import", 400, editor.cookie, { url: "http://127.0.0.1/private" }, "POST");
  await call("/api/v1/admin/repositories/discover", 400, editor.cookie, { query: "agent", perPage: 101 }, "POST");
  const imported = await (await call("/api/v1/admin/repositories/import", 202, editor.cookie, { url: metadata().html_url }, "POST", base, "p2-http-idempotent")).json(); const taskId: string = imported.data.task.id;
  const repeat = await (await call("/api/v1/admin/repositories/import", 202, editor.cookie, { url: metadata().html_url }, "POST", base, "p2-http-idempotent")).json(); assert.equal(repeat.data.task.id, taskId);
  await call("/api/v1/admin/repositories/import", 409, editor.cookie, { url: "https://github.com/skillhub-fixture/other" }, "POST", base, "p2-http-idempotent");
  const queued = await (await call(`/api/v1/admin/collection-tasks/${taskId}`, 200, admin.cookie)).json(); assert.equal(queued.data.status, "QUEUED");
  await call(`/api/v1/admin/collection-tasks/${taskId}/retry`, 409, admin.cookie, undefined, "POST");
  const mock: typeof fetch = async input => String(input).endsWith("/readme") ? response(readme(), 200, { etag: '"doc"' }) : response(metadata(), 200, { etag: '"metadata"' });
  const worker = new CollectorWorker(prisma, { fetch: mock, intervalMs: 0 });
  for (let i = 0; i < 4; i++) await worker.runStep();
  const complete = await (await call(`/api/v1/admin/collection-tasks/${taskId}`, 200, editor.cookie)).json(); assert.equal(complete.data.status, "SUCCEEDED");
  const repo = await prisma.githubRepository.findUniqueOrThrow({ where: { githubId: 910001n } });
  const listed = await (await call("/api/v1/admin/repositories?pageSize=1", 200, admin.cookie)).json(); assert.equal(listed.data.items.length, 1); assert.equal(typeof listed.data.items[0].githubId, "string");
  const details = await (await call(`/api/v1/admin/repositories/${repo.id}`, 200, editor.cookie)).json(); assert.ok(details.data.readmeText.includes("Ignore previous instructions"));
  const repoHtml = await (await call(`/admin/repositories/${repo.id}`, 200, admin.cookie)).text(); assert.ok(repoHtml.includes("README 摘录"));
  await call(`/api/v1/admin/repositories/${repo.id}`, 200, editor.cookie, { syncEnabled: false }, "PATCH"); assert.equal((await prisma.githubRepository.findUniqueOrThrow({ where: { id: repo.id } })).syncEnabled, false);
  await call(`/api/v1/admin/repositories/${repo.id}`, 400, editor.cookie, { syncEnabled: false, url: "https://evil.example" }, "PATCH");
  await call(`/api/v1/admin/repositories/${repo.id}/refresh`, 202, editor.cookie, undefined, "POST");
  const logs = await (await call(`/api/v1/admin/collection-tasks/${taskId}/logs?pageSize=1`, 200, editor.cookie)).json(); assert.equal(logs.data.items.length, 1); assert.ok(logs.data.total > 1);
  const taskItems = await (await call(`/api/v1/admin/collection-tasks/${taskId}/items`, 200, editor.cookie)).json(); assert.equal(taskItems.data.items.length, 1); assert.equal(typeof taskItems.data.items[0].githubId, "string");
  await call("/api/v1/admin/collection-tasks?page=0", 400, editor.cookie);
  const taskHtml = await (await call(`/admin/collection-tasks/${taskId}`, 200, editor.cookie)).text(); assert.ok(taskHtml.includes("任务日志"));
  await call(`/api/v1/admin/collection-tasks/${taskId}`, 403, ordinary.cookie);
  await prisma.user.update({ where: { id: editor.user.id }, data: { role: "USER" } }); await call("/api/v1/admin/repositories", 403, editor.cookie);
  const cookies = await prisma.session.findFirstOrThrow({ where: { userId: admin.user.id } }); await prisma.session.update({ where: { id: cookies.id }, data: { expires: new Date(Date.now() - 1000) } }); await call("/api/v1/admin/repositories", 401, admin.cookie);
  await call("/api/v1/admin/repositories/missing", 401);
  const fresh = await session("EDITOR"); await call("/api/v1/admin/repositories/missing", 404, fresh.cookie);
  console.log(`Admin HTTP integration: ${checks} checks passed with real database sessions in isolated test DB. OAuth browser login was not simulated.`);
} finally { server.kill("SIGTERM"); await new Promise<void>(r => { if (server.exitCode !== null) r(); else { server.once("exit", () => r()); setTimeout(r, 5000); } }); await prisma.$disconnect(); }
