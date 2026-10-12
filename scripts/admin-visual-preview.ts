import "dotenv/config";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3300";
const dbUrl = new URL(process.env.DATABASE_URL!);
assert.ok(dbUrl.hostname === "127.0.0.1" && dbUrl.port === "55432" && dbUrl.pathname === "/skillhub", "Visual capture only runs against the dedicated local database");
const prisma = new PrismaClient();
const actor = await prisma.user.create({ data: { name: "临时后台只读视觉验收", role: "ADMIN" } });
try {
  const token = randomUUID();
  await prisma.session.create({ data: { userId: actor.id, sessionToken: token, expires: new Date(Date.now() + 600000) } });
  await mkdir("artifacts", { recursive: true });
  const pages = [{ path: "/admin/repositories", file: "admin-repositories-visual.html" }, { path: "/admin/collection-tasks", file: "admin-tasks-visual.html" }];
  for (const page of pages) {
    const r = await fetch(`${base}${page.path}`, { headers: { Cookie: `next-auth.session-token=${token}` }, redirect: "manual" });
    assert.equal(r.status, 200);
    const html = (await r.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<body([^>]*)>/, '<body$1><div style="padding:12px 24px;background:#fff6dc;color:#77652b;border-bottom:1px solid #e7dcae;font:13px Arial,sans-serif">只读视觉验收：真实本地仓库/任务记录，使用临时数据库会话；不代表 GitHub OAuth 登录已验证。交互脚本已移除。</div>');
    await writeFile(`artifacts/${page.file}`, html);
  }
} finally { await prisma.user.delete({ where: { id: actor.id } }); await prisma.$disconnect(); }
const staticRoot = resolve(".next/static"); const artifactRoot = resolve("artifacts");
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url ?? "/", "http://127.0.0.1:3302").pathname;
  let file: string;
  if (["/admin-repositories-visual.html", "/admin-tasks-visual.html"].includes(pathname)) file = resolve(artifactRoot, pathname.slice(1));
  else if (pathname.startsWith("/_next/static/")) { file = resolve(staticRoot, pathname.slice("/_next/static/".length)); if (!file.startsWith(staticRoot + sep)) { res.writeHead(403).end(); return; } }
  else { res.writeHead(404).end(); return; }
  try { const bytes = await readFile(file); res.writeHead(200, { "Content-Type": file.endsWith(".css") ? "text/css" : file.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'none'" }); res.end(bytes); } catch { res.writeHead(404).end(); }
});
server.listen(3302, "127.0.0.1", () => console.log("Read-only admin visual artifacts: http://127.0.0.1:3302/admin-repositories-visual.html"));
process.on("SIGINT", () => server.close()); process.on("SIGTERM", () => server.close());
