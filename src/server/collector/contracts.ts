import { z } from "zod";
import { parseGithubUrl } from "../../lib/validation";

export const githubUrlSchema = z.string().max(512).transform((value, ctx) => {
  try { return parseGithubUrl(value).url; } catch { ctx.addIssue({ code: "custom", message: "请输入标准 HTTPS GitHub 仓库地址" }); return z.NEVER; }
});
export const importInput = z.strictObject({ url: githubUrlSchema });
export const discoverInput = z.strictObject({ query: z.string().trim().min(2).max(200), perPage: z.coerce.number().int().min(1).max(100).default(10), maxPages: z.coerce.number().int().min(1).max(10).default(3), minStars: z.coerce.number().int().min(0).max(10000000).default(0) });
export const taskPayload = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("IMPORT"), url: githubUrlSchema }),
  z.object({ kind: z.literal("REFRESH"), url: githubUrlSchema, repositoryId: z.string(), githubId: z.string().regex(/^\d+$/) }),
  discoverInput.extend({ kind: z.literal("DISCOVER") })
]);
export type TaskPayload = z.infer<typeof taskPayload>;
export const adminListQuery = z.object({ q: z.string().trim().max(100).default(""), page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20), status: z.preprocess(v => v === "" ? undefined : v, z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]).optional()) });
export const repoListQuery = adminListQuery.extend({ sync: z.preprocess(v => v === "" ? undefined : v, z.enum(["enabled", "disabled"]).optional()) });
export const repositorySchema = z.object({ id: z.number().int().positive().safe(), full_name: z.string().max(255), html_url: githubUrlSchema, private: z.literal(false), description: z.string().max(20000).nullable(), topics: z.array(z.string().max(200)).max(100).default([]), stargazers_count: z.number().int().nonnegative(), forks_count: z.number().int().nonnegative(), updated_at: z.iso.datetime(), archived: z.boolean(), license: z.object({ spdx_id: z.string().max(100), name: z.string().max(500) }).nullable() }).superRefine((r, ctx) => {
  const canonical = parseGithubUrl(r.html_url);
  if (`${canonical.owner}/${canonical.repo}`.toLowerCase() !== r.full_name.toLowerCase()) ctx.addIssue({ code: "custom", message: "仓库来源不一致" });
});
export type RepositoryMetadata = z.infer<typeof repositorySchema>;
export const searchSchema = z.object({ total_count: z.number().int().nonnegative(), incomplete_results: z.boolean(), items: z.array(repositorySchema).max(100) });
export const readmeSchema = z.object({ sha: z.string().regex(/^[0-9a-f]{40,64}$/), size: z.number().int().nonnegative(), encoding: z.literal("base64"), content: z.string() });
export function searchQuery(payload: Extract<TaskPayload, { kind: "DISCOVER" }>) { return `${payload.query} is:public stars:>=${payload.minStars}`; }
