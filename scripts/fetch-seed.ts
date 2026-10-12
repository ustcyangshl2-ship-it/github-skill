import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { parseGithubUrl } from "../src/lib/validation";

const repoSchema = z.object({ id: z.number().int().positive(), full_name: z.string(), html_url: z.url(), description: z.string().nullable(), stargazers_count: z.number().int().nonnegative(), forks_count: z.number().int().nonnegative(), topics: z.array(z.string()), updated_at: z.iso.datetime(), archived: z.boolean(), license: z.object({ spdx_id: z.string(), name: z.string() }).nullable() });
const names = ["anthropics/skills", "obra/superpowers", "vercel-labs/agent-skills", "microsoft/markitdown", "HKUDS/LightRAG", "langgenius/dify", "open-webui/open-webui", "n8n-io/n8n"];
const repositories = [];
for (const name of names) {
  const { owner, repo } = parseGithubUrl(`https://github.com/${name}`);
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { redirect: "error", signal: AbortSignal.timeout(15000), headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "SkillHub-P1-Snapshot", ...(process.env.GITHUB_TOKEN && { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }) } });
  if (!response.ok) throw new Error(`GitHub ${name}: HTTP ${response.status}; no snapshot was written`);
  const parsed = repoSchema.parse(await response.json());
  parseGithubUrl(parsed.html_url);
  repositories.push({ ...parsed, fetchedAt: new Date().toISOString() });
  console.log(`Snapshot: ${parsed.full_name}`);
  await new Promise(resolve => setTimeout(resolve, 1100));
}
await mkdir("data", { recursive: true });
await writeFile("data/github-snapshot.json", JSON.stringify({ source: "GitHub REST API /repos/{owner}/{repo}", note: "真实元数据快照；不是实时数据，也不是项目实测证据", repositories }, null, 2) + "\n");
console.log(`Saved ${repositories.length} real repository snapshots. Run seed only after reviewing changes.`);
