import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CatalogQuery } from "@/lib/validation";

export const skillInclude = { repository: true, categories: { include: { category: true } }, tags: { include: { tag: true } }, platforms: { include: { platform: true } } } satisfies Prisma.SkillInclude;
export type SkillCardData = Prisma.SkillGetPayload<{ include: typeof skillInclude }>;

export async function listSkills(query: CatalogQuery) {
  const where: Prisma.SkillWhereInput = {
    status: "PUBLISHED",
    ...(query.type && { type: query.type }),
    ...(query.category && { categories: { some: { category: { slug: query.category } } } }),
    ...(query.q && { OR: [
      { title: { contains: query.q, mode: "insensitive" } },
      { summaryZh: { contains: query.q, mode: "insensitive" } },
      { repository: { description: { contains: query.q, mode: "insensitive" } } },
      { repository: { fullName: { contains: query.q, mode: "insensitive" } } },
      { tags: { some: { tag: { name: { contains: query.q, mode: "insensitive" } } } } }
    ] })
  };
  const orderBy: Prisma.SkillOrderByWithRelationInput[] = query.sort === "recent" ? [{ repository: { sourceUpdatedAt: "desc" } }, { id: "asc" }] : query.sort === "editor" ? [{ featured: "desc" }, { editorialOrder: "asc" }, { id: "asc" }] : [{ repository: { stars: "desc" } }, { id: "asc" }];
  const [total, items] = await db.$transaction([
    db.skill.count({ where }),
    db.skill.findMany({ where, include: skillInclude, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize })
  ], { isolationLevel: "RepeatableRead" });
  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) };
}
export async function categories() {
  return db.category.findMany({ orderBy: { sort: "asc" }, include: { _count: { select: { skills: { where: { skill: { status: "PUBLISHED" } } } } } } });
}
export async function skillBySlug(slug: string) {
  return db.skill.findFirst({ where: { slug, status: "PUBLISHED" }, include: { ...skillInclude, reviews: { where: { status: "PUBLISHED" } }, tutorials: { where: { status: "PUBLISHED" }, select: { slug: true, title: true, excerpt: true, access: true } } } });
}
export function publicSkill(skill: SkillCardData) {
  return { id: skill.id, slug: skill.slug, title: skill.title, summaryZh: skill.summaryZh, descriptionZh: skill.descriptionZh, type: skill.type, difficulty: skill.reviewedAt ? skill.difficulty : null, audience: skill.audience, scenarios: skill.scenarios, featured: skill.featured, categories: skill.categories.map(x => ({ name: x.category.name, slug: x.category.slug })), tags: skill.tags.map(x => x.tag.name), platforms: skill.reviewedAt ? skill.platforms.map(x => x.platform.name) : [], repository: { githubId: skill.repository.githubId.toString(), fullName: skill.repository.fullName, url: skill.repository.url, description: skill.repository.description, stars: skill.repository.stars, forks: skill.repository.forks, topics: skill.repository.topics, licenseSpdx: skill.repository.licenseSpdx, licenseName: skill.repository.licenseName, sourceUpdatedAt: skill.repository.sourceUpdatedAt, fetchedAt: skill.repository.fetchedAt } };
}
