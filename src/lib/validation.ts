import { z } from "zod";

export function parseGithubUrl(input: string): { owner: string; repo: string; url: string } {
  const value = input.trim();
  const parsed = new URL(value);
  if (!/^https:\/\/github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+\/?$/i.test(value)) throw new Error("请输入标准 GitHub 仓库路径");
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" || parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash || /[\\%]/.test(value)) throw new Error("请输入标准 HTTPS GitHub 仓库地址");
  const parts = parsed.pathname.replace(/\/$/, "").split("/").filter(Boolean);
  if (parts.length !== 2 || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(parts[0]) || !/^[a-zA-Z0-9_.-]{1,100}$/.test(parts[1]) || parts[1] === "." || parts[1] === ".." || parsed.pathname.includes("//")) throw new Error("仓库路径应为 owner/repo");
  const repo = parts[1].replace(/\.git$/, "");
  if (!repo || repo === "." || repo === "..") throw new Error("仓库名无效");
  return { owner: parts[0], repo, url: `https://github.com/${parts[0]}/${repo}` };
}

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  category: z.preprocess(v => v === "" ? undefined : v, z.string().regex(/^[a-z0-9-]{1,80}$/).optional()),
  type: z.preprocess(v => v === "" ? undefined : v, z.enum(["SKILL", "TOOL", "FRAMEWORK"]).optional()),
  sort: z.enum(["stars", "recent", "editor"]).default("stars"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(6)
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

// P3 contract only; this schema does not call a model or publish content.
export const aiResultSchema = z.strictObject({
  type: z.enum(["SKILL", "TOOL", "FRAMEWORK"]),
  categorySlugs: z.array(z.string().regex(/^[a-z0-9-]+$/).max(80)).min(1).max(5),
  tags: z.array(z.string().min(1).max(40)).max(10),
  summaryZh: z.string().min(20).max(600),
  audience: z.array(z.string().min(1).max(100)).min(1).max(6),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  scenarios: z.array(z.string().min(1).max(200)).min(1).max(8),
  preliminaryScore: z.number().int().min(0).max(100).nullable(),
  reasoning: z.string().min(20).max(1200)
});
