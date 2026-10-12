import { describe, expect, it } from "vitest";
import { parseGithubUrl, catalogQuerySchema, aiResultSchema } from "../src/lib/validation";
import { canManageContent, canReadTutorial, hasMembership } from "../src/lib/access";

describe("GitHub URL boundary", () => {
  it.each(["https://github.com/anthropics/skills", "https://github.com/anthropics/skills/", "https://github.com/anthropics/skills.git"])("normalizes %s", url => expect(parseGithubUrl(url).url).toBe("https://github.com/anthropics/skills"));
  it.each(["http://github.com/a/b", "https://evil.example/a/b", "https://github.com.evil.example/a/b", "https://127.0.0.1/a/b", "https://github.com:8443/a/b", "https://u:p@github.com/a/b", "https://github.com/a/b?x=1", "https://github.com/a/b#readme", "https://github.com/a/b/tree/main", "https://github.com/a", "https://github.com/a//b", "https://github.com/a/%62", "https://github.com\\@evil.example/a/b", "file:///etc/passwd", "https://github.com/a/.git"])("rejects %s", url => expect(() => parseGithubUrl(url)).toThrow());
});
describe("Catalog query", () => {
  it("uses bounded defaults", () => expect(catalogQuerySchema.parse({})).toEqual({ q: "", sort: "stars", page: 1, pageSize: 6 }));
  it("accepts empty form filters as all", () => { const q = catalogQuerySchema.parse({ type: "", category: "" }); expect(q.type).toBeUndefined(); expect(q.category).toBeUndefined(); });
  it("rejects normalized traversal and explicit default ports", () => { for (const url of ["https://github.com/a/../b/c", "https://github.com:443/a/b"]) expect(() => parseGithubUrl(url)).toThrow(); });
  it.each([{ page: 0 }, { pageSize: 1000 }, { sort: "random" }, { type: "UNKNOWN" }, { q: "a".repeat(101) }, { category: "../admin" }])("rejects invalid input %j", input => expect(catalogQuerySchema.safeParse(input).success).toBe(false));
});
describe("Server access policy", () => {
  const now = new Date("2026-10-12T00:00:00Z");
  const grant = { status: "ACTIVE", startsAt: new Date("2026-10-11T00:00:00Z"), expiresAt: new Date("2026-10-13T00:00:00Z") };
  it("allows public tutorials without login", () => expect(canReadTutorial("FREE", [], now)).toBe(true));
  it("requires a currently active grant", () => { expect(canReadTutorial("MEMBER", [], now)).toBe(false); expect(hasMembership([grant], now)).toBe(true); });
  it("denies revoked grants", () => expect(hasMembership([{ ...grant, status: "REVOKED" }], now)).toBe(false));
  it("denies future grants", () => expect(hasMembership([{ ...grant, startsAt: new Date("2026-10-13") }], now)).toBe(false));
  it("denies at exact expiry", () => expect(hasMembership([{ ...grant, expiresAt: now }], now)).toBe(false));
  it("reads database roles with exact allow-list", () => { expect(canManageContent("USER")).toBe(false); expect(canManageContent("EDITOR")).toBe(true); expect(canManageContent("ADMIN")).toBe(true); expect(canManageContent(undefined)).toBe(false); expect(canManageContent("admin")).toBe(false); });
});
describe("Future AI structured contract", () => {
  const valid = { type: "SKILL", categorySlugs: ["agents"], tags: ["Agent"], summaryZh: "这是用于阅读和学习技能组织方式的中文摘要示例内容。", audience: ["学习者"], difficulty: "BEGINNER", scenarios: ["阅读技能文档"], preliminaryScore: 70, reasoning: "仅为静态结构契约测试，本结果不代表实际项目质量或实测结果。" };
  it("accepts the declared contract", () => expect(aiResultSchema.safeParse(valid).success).toBe(true));
  it("permits withholding an unsupported preliminary score", () => expect(aiResultSchema.safeParse({ ...valid, preliminaryScore: null }).success).toBe(true));
  it("rejects injected undeclared fields", () => expect(aiResultSchema.safeParse({ ...valid, publish: true, role: "ADMIN" }).success).toBe(false));
  it("rejects invalid score/type/empty categories", () => { for (const changes of [{ preliminaryScore: 101 }, { type: "VERIFIED" }, { categorySlugs: [] }]) expect(aiResultSchema.safeParse({ ...valid, ...changes }).success).toBe(false); });
});
