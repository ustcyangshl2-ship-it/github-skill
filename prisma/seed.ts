import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaClient, type ResourceType, type Difficulty } from "@prisma/client";
import { z } from "zod";
import { parseGithubUrl } from "../src/lib/validation";
import { aiResultSchema } from "../src/lib/validation";

const prisma = new PrismaClient();
const snapshot = z.object({ repositories: z.array(z.object({ id: z.number().int().positive(), full_name: z.string(), html_url: z.string(), description: z.string().nullable(), stargazers_count: z.number().int().nonnegative(), forks_count: z.number().int().nonnegative(), topics: z.array(z.string()), updated_at: z.iso.datetime(), fetchedAt: z.iso.datetime(), archived: z.boolean(), license: z.object({ spdx_id: z.string(), name: z.string() }).nullable() })) }).parse(JSON.parse(await readFile("data/github-snapshot.json", "utf8")));
const categoryData = [
  ["agents", "Agent 与 Skill", "Sparkles"], ["research", "科研探索", "FlaskConical"], ["office", "办公效率", "Files"], ["coding", "编程开发", "Code2"], ["teaching", "教学学习", "GraduationCap"], ["workflow", "自动化工作流", "Workflow"]
];
const entries: { name: string; slug: string; title: string; summary: string; type: ResourceType; difficulty: Difficulty; categories: string[]; tags: string[]; audience: string[]; scenarios: string[]; platform: string }[] = [
  { name: "anthropics/skills", slug: "anthropic-skills", title: "Anthropic Skills", summary: "了解 Agent Skills 的组织方式，从文档、设计到开发，探索可复用的任务说明与资源。", type: "SKILL", difficulty: "BEGINNER", categories: ["agents", "office", "teaching"], tags: ["Agent Skills", "Claude"], audience: ["AI应用学习者", "办公用户"], scenarios: ["阅读技能目录", "学习技能编写规范"], platform: "Claude 生态" },
  { name: "obra/superpowers", slug: "superpowers", title: "Superpowers", summary: "面向编程 Agent 的技能和工作流集合，覆盖需求梳理、计划与开发协作等环节。", type: "SKILL", difficulty: "INTERMEDIATE", categories: ["agents", "coding"], tags: ["开发工作流", "Agent Skills"], audience: ["软件开发者"], scenarios: ["探索开发任务工作流", "学习 Agent 协作规范"], platform: "编程 Agent" },
  { name: "vercel-labs/agent-skills", slug: "vercel-agent-skills", title: "Vercel Agent Skills", summary: "Vercel Labs 发布的 Agent 技能集合，适合关注前端开发和工程实践的用户阅读。", type: "SKILL", difficulty: "INTERMEDIATE", categories: ["agents", "coding"], tags: ["前端", "Agent Skills"], audience: ["前端开发者"], scenarios: ["查阅前端工程实践", "了解技能文档结构"], platform: "编程 Agent" },
  { name: "microsoft/markitdown", slug: "markitdown", title: "MarkItDown", summary: "将多种文件转换为 Markdown 的工具，可作为整理文档、建立知识库之前的预处理环节。", type: "TOOL", difficulty: "INTERMEDIATE", categories: ["office", "research", "teaching"], tags: ["文档处理", "Markdown"], audience: ["科研人员", "教师", "知识管理用户"], scenarios: ["文档文本预处理", "整理可检索资料"], platform: "Python" },
  { name: "HKUDS/LightRAG", slug: "lightrag", title: "LightRAG", summary: "检索增强生成项目，供研究者与开发者探索知识组织和大模型问答应用。", type: "FRAMEWORK", difficulty: "ADVANCED", categories: ["research", "coding"], tags: ["RAG", "知识库"], audience: ["AI研究者", "后端开发者"], scenarios: ["研究检索增强生成", "探索知识库原型"], platform: "Python" },
  { name: "langgenius/dify", slug: "dify", title: "Dify", summary: "面向大模型应用的开发平台，可用于了解工作流编排、知识库和应用发布等能力。", type: "TOOL", difficulty: "INTERMEDIATE", categories: ["workflow", "coding", "teaching"], tags: ["工作流", "知识库"], audience: ["AI应用开发者", "教学实践者"], scenarios: ["设计大模型应用流程", "搭建知识库原型"], platform: "Web / 自托管" },
  { name: "open-webui/open-webui", slug: "open-webui", title: "Open WebUI", summary: "可自托管的 AI 交互界面项目，适合探索模型接入和个人或团队的 AI 使用入口。", type: "TOOL", difficulty: "INTERMEDIATE", categories: ["office", "teaching"], tags: ["自托管", "模型界面"], audience: ["AI学习者", "团队管理员"], scenarios: ["了解自托管 AI 界面", "探索模型交互入口"], platform: "Web / 自托管" },
  { name: "n8n-io/n8n", slug: "n8n", title: "n8n", summary: "工作流自动化平台，可用于了解服务连接、数据处理及 AI 任务编排；使用前需仔细核对许可范围。", type: "TOOL", difficulty: "INTERMEDIATE", categories: ["workflow", "office"], tags: ["工作流", "自动化"], audience: ["自动化实践者", "办公用户"], scenarios: ["探索服务间工作流", "学习任务编排"], platform: "Web / 自托管" }
];

try {
  await prisma.$transaction(async tx => {
    for (const [sort, [slug, name, icon]] of categoryData.entries()) await tx.category.upsert({ where: { slug }, create: { slug, name, icon, sort }, update: {} });
    for (const [position, entry] of entries.entries()) {
      const repo = snapshot.repositories.find(r => r.full_name.toLowerCase() === entry.name.toLowerCase());
      if (!repo) throw new Error(`Missing real snapshot: ${entry.name}`);
      const sourceUrl = parseGithubUrl(repo.html_url).url;
      const fetchedAt = new Date(repo.fetchedAt);
      const repository = await tx.githubRepository.upsert({ where: { githubId: BigInt(repo.id) }, create: { githubId: BigInt(repo.id), fullName: repo.full_name, url: sourceUrl, description: repo.description, topics: repo.topics, stars: repo.stargazers_count, forks: repo.forks_count, licenseSpdx: repo.license?.spdx_id, licenseName: repo.license?.name, sourceUpdatedAt: new Date(repo.updated_at), fetchedAt, archived: repo.archived }, update: {} });
      await tx.repositorySnapshot.upsert({ where: { repositoryId_day: { repositoryId: repository.id, day: new Date(`${new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(fetchedAt)}T00:00:00Z`) } }, create: { repositoryId: repository.id, day: new Date(`${new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(fetchedAt)}T00:00:00Z`), stars: repo.stargazers_count, forks: repo.forks_count, fetchedAt }, update: {} });
      const existing = await tx.skill.findUnique({ where: { repositoryId: repository.id } });
      if (existing) {
        // Only move our original, never-reviewed P1 seed into the queue. Preserve edited rows.
        if (existing.version === 1 && !existing.reviewerId && !existing.reviewedAt && existing.summaryZh === entry.summary) await tx.skill.update({ where: { id: existing.id }, data: { summaryZh: "", descriptionZh: "", audience: [], scenarios: [] } });
        await tx.aiTask.upsert({ where: { dedupeKey: `p1-content-draft:${existing.id}` }, update: {}, create: { skillId: existing.id, status: "PENDING_REVIEW", dedupeKey: `p1-content-draft:${existing.id}`, inputHash: `github:${repo.id}:${repo.updated_at}`, sourceVersion: existing.version, provider: "initialization-draft", model: "code-assistant-draft-not-runtime-api", promptVersion: "p1-seed-v1", result: aiResultSchema.parse({ type: entry.type, categorySlugs: entry.categories, tags: entry.tags, summaryZh: entry.summary, audience: entry.audience, difficulty: entry.difficulty, scenarios: entry.scenarios, preliminaryScore: null, reasoning: "这是初始化生成的中文解读草稿，尚未经过人工审核，不是运行时大模型API调用结果。效果与平台兼容性没有实测证据，不提供质量分。" }) } });
        continue;
      }
      const cats = await tx.category.findMany({ where: { slug: { in: entry.categories } } });
      const tags = [];
      for (const name of entry.tags) tags.push(await tx.tag.upsert({ where: { slug: name }, create: { slug: name, name }, update: {} }));
      const platform = await tx.platform.upsert({ where: { slug: entry.platform }, create: { slug: entry.platform, name: entry.platform }, update: {} });
      const skill = await tx.skill.create({ data: { repositoryId: repository.id, slug: entry.slug, title: entry.title, summaryZh: "", descriptionZh: "", type: entry.type, difficulty: entry.difficulty, audience: [], scenarios: [], status: "PUBLISHED", featured: position < 3, editorialOrder: position, publishedAt: fetchedAt, categories: { create: cats.map(c => ({ categoryId: c.id })) }, tags: { create: tags.map(t => ({ tagId: t.id })) }, platforms: { create: [{ platformId: platform.id }] } } });
      await tx.aiTask.create({ data: { skillId: skill.id, status: "PENDING_REVIEW", dedupeKey: `p1-content-draft:${skill.id}`, inputHash: `github:${repo.id}:${repo.updated_at}`, sourceVersion: 1, provider: "initialization-draft", model: "code-assistant-draft-not-runtime-api", promptVersion: "p1-seed-v1", result: aiResultSchema.parse({ type: entry.type, categorySlugs: entry.categories, tags: entry.tags, summaryZh: entry.summary, audience: entry.audience, difficulty: entry.difficulty, scenarios: entry.scenarios, preliminaryScore: null, reasoning: "这是初始化生成的中文解读草稿，尚未经过人工审核，不是运行时大模型API调用结果。效果与平台兼容性没有实测证据，不提供质量分。" }) } });
    }
    const collections = [
      { slug: "research-starter", title: "科研资料，从整理开始", description: "先了解文档转换，再探索检索增强生成。适合想建立研究资料流程的你。", icon: "FlaskConical", slugs: ["markitdown", "lightrag"] },
      { slug: "teaching-ai", title: "教师的 AI 探索清单", description: "从可复用任务说明、资料处理到 AI 应用原型，为教学实践寻找入口。", icon: "GraduationCap", slugs: ["anthropic-skills", "markitdown", "dify"] },
      { slug: "office-flow", title: "让重复工作少一点", description: "文档整理、交互界面和工作流编排，逐步搭建自己的办公工具箱。", icon: "Files", slugs: ["markitdown", "open-webui", "n8n"] },
      { slug: "agent-coding", title: "编程 Agent 进阶路线", description: "认识 Skills，理解工作流，再阅读前端工程实践。精选代表可读性，不代表实测通过。", icon: "Code2", slugs: ["anthropic-skills", "superpowers", "vercel-agent-skills"] }
    ];
    for (const item of collections) {
      if (await tx.collection.findUnique({ where: { slug: item.slug } })) continue;
      const skills = await tx.skill.findMany({ where: { slug: { in: item.slugs } } });
      await tx.collection.create({ data: { slug: item.slug, title: item.title, description: item.description, icon: item.icon, status: "PUBLISHED", items: { create: item.slugs.map((slug, position) => ({ skillId: skills.find(s => s.slug === slug)!.id, position })) } } });
    }
    await tx.tutorial.upsert({ where: { slug: "read-an-ai-repository" }, update: {}, create: { slug: "read-an-ai-repository", title: "第一次看 AI 仓库，先检查这 5 件事", excerpt: "从项目来源、许可证、更新状态、运行条件和验证证据开始，建立自己的筛选方法。", status: "PUBLISHED", access: "FREE", publishedAt: new Date(), body: { create: { text: "01 · 确认来源\n打开原始 GitHub 地址，核对仓库所有者与项目名称。导航站的中文说明只是阅读入口，具体能力应以源项目文档为准。\n\n02 · 阅读许可证\n找到 LICENSE 文件并阅读全文。开源、公开可见和可商用并不等同；没有明确许可证时，不要自行推定授权。\n\n03 · 观察维护情况\n查看最近提交、版本说明和问题讨论。Star 代表关注度，无法证明质量或安全；本文页面的数据是带日期的快照。\n\n04 · 核对运行条件\n确认系统、语言版本、模型接口、费用、网络和数据权限。先阅读文档，不要直接在生产环境执行陌生脚本。\n\n05 · 找到验证证据\n区分作者声称、编辑解读和实际测试。本站未测试的条目会明确标注；开始自己的测试时，记录版本、环境、输入和结果。\n\n下一步\n选择一个符合场景的项目，阅读官方快速开始，在隔离的测试环境中验证最小流程。" } } } });
  }, { timeout: 30000 });
  console.log("Seed complete: real metadata and queued Chinese drafts; no unreviewed AI summaries published.");
} finally { await prisma.$disconnect(); }
