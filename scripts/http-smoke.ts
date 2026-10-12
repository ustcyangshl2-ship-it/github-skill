import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3300";
const databaseUrl = new URL(process.env.DATABASE_URL!);
const origin = new URL(base);
assert.ok(databaseUrl.hostname === "127.0.0.1" && databaseUrl.port === "55432" && databaseUrl.pathname === "/skillhub", "HTTP fixtures may only run against the dedicated local database");
assert.ok(["localhost", "127.0.0.1"].includes(origin.hostname) && origin.port === "3300", "HTTP fixture target must be local SkillHub on 3300");
const suffix = `${Date.now()}`;
const memberSlug = `test-member-${suffix}`;
const draftSlug = `test-draft-${suffix}`;
const secretText = `PRIVATE_BODY_${suffix}`;
let repoId: string | undefined;
let checks = 0;
async function request(path: string, status = 200) {
  const response = await fetch(`${base}${path}`, { redirect: "manual", signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, status, path); checks++; console.log(`PASS HTTP ${status} ${path}`); return response;
}
try {
  for (const path of ["/", "/skills", "/skills/anthropic-skills", "/rankings", "/rankings?mode=growth", "/collections", "/collections/agent-coding", "/tutorials", "/tutorials/read-an-ai-repository", "/login", "/api/health"]) await request(path);
  for (const path of ["/account", "/admin"]) { const r = await request(path, 307); assert.equal(r.headers.get("location"), "/login"); }
  await request("/api/auth/session", 503);
  const all = await (await request("/api/v1/skills?pageSize=24")).json(); assert.equal(all.meta.total, 8); assert.equal(all.data.length, 8);
  for (let i = 1; i < all.data.length; i++) assert.ok(all.data[i - 1].repository.stars >= all.data[i].repository.stars);
  const searched = await (await request("/api/v1/skills?q=MarkItDown")).json(); assert.equal(searched.meta.total, 1);
  const filtered = await (await request("/api/v1/skills?category=research")).json(); assert.equal(filtered.meta.total, 2);
  const type = await (await request("/api/v1/skills?type=SKILL")).json(); assert.equal(type.meta.total, 3);
  const paged = await (await request("/api/v1/skills?page=2&pageSize=6")).json(); assert.equal(paged.data.length, 2);
  assert.equal((await (await request("/api/v1/skills?q=nonexistent-skillhub-xyz")).json()).meta.total, 0);
  await request("/api/v1/skills?page=-1", 400); await request("/api/v1/skills?sort=random", 400); await request("/api/v1/skills?pageSize=100", 400);
  const xss = await (await request("/skills?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E")).text(); assert.ok(!xss.includes("<script>alert(1)</script>"));
  await request("/api/v1/skills/unknown-slug", 404); await request("/skills/unknown-slug", 404);
  const details = await (await request("/api/v1/skills/anthropic-skills")).json(); assert.equal(typeof details.data.repository.githubId, "string"); assert.equal(details.data.reviews.length, 0);
  assert.equal(details.data.summaryZh, ""); assert.equal(details.data.audience.length, 0);
  const draft = await prisma.aiTask.findFirstOrThrow({ where: { skill: { slug: "anthropic-skills" }, status: "PENDING_REVIEW" } });
  const draftSummary = (draft.result as { summaryZh: string }).summaryZh;
  const publicHtml = await (await request("/skills/anthropic-skills")).text(); assert.ok(!publicHtml.includes(draftSummary)); checks++; console.log("PASS pending Chinese draft is absent from public HTML/API");
  const free = await (await request("/api/v1/tutorials/read-an-ai-repository")).json(); assert.ok(free.data.text.includes("确认来源"));
  await prisma.tutorial.create({ data: { slug: memberSlug, title: "Test-only membership boundary", excerpt: "test-only", status: "PUBLISHED", access: "MEMBER", body: { create: { text: secretText } } } });
  const denied = await request(`/api/v1/tutorials/${memberSlug}`, 403); assert.ok(!(await denied.text()).includes(secretText));
  const html = await (await request(`/tutorials/${memberSlug}`)).text(); assert.ok(!html.includes(secretText));
  const rsc = await fetch(`${base}/tutorials/${memberSlug}?_rsc=test`, { headers: { RSC: "1" } }); assert.ok(!(await rsc.text()).includes(secretText)); checks++; console.log("PASS unauthorized RSC does not contain member body");
  const repo = await prisma.githubRepository.create({ data: { githubId: BigInt(Date.now()), fullName: `test-only/${suffix}`, url: `https://github.com/test-only/${suffix}`, topics: [], sourceUpdatedAt: new Date() } }); repoId = repo.id;
  await prisma.skill.create({ data: { repositoryId: repo.id, slug: draftSlug, title: draftSlug, summaryZh: "test-only", descriptionZh: "test-only", type: "SKILL", difficulty: "BEGINNER", audience: [], scenarios: [], status: "DRAFT" } });
  await request(`/api/v1/skills/${draftSlug}`, 404); await request(`/skills/${draftSlug}`, 404);
  assert.equal((await (await request(`/api/v1/skills?q=${draftSlug}`)).json()).meta.total, 0);
  console.log(`HTTP integration: ${checks} checks passed.`);
} finally {
  await prisma.tutorial.deleteMany({ where: { slug: memberSlug } });
  if (repoId) { await prisma.skill.deleteMany({ where: { repositoryId: repoId } }); await prisma.githubRepository.delete({ where: { id: repoId } }); }
  await prisma.$disconnect();
}
