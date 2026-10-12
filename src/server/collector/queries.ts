import type { Prisma } from "@prisma/client";
import { db } from "../../lib/db";
import { adminListQuery, repoListQuery } from "./contracts";
export async function repositoryList(input: unknown) {
  const query = repoListQuery.parse(input);
  const where: Prisma.GithubRepositoryWhereInput = { ...(query.q && { OR: [{ fullName: { contains: query.q, mode: "insensitive" } }, { description: { contains: query.q, mode: "insensitive" } }] }), ...(query.sync && { syncEnabled: query.sync === "enabled" }) };
  const [total, items] = await db.$transaction([db.githubRepository.count({ where }), db.githubRepository.findMany({ where, orderBy: [{ fetchedAt: "desc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: { id: true, githubId: true, fullName: true, url: true, stars: true, forks: true, licenseSpdx: true, fetchedAt: true, readmeState: true, syncEnabled: true, skill: { select: { status: true, type: true } } } })]);
  return { items: items.map(i => ({ ...i, githubId: i.githubId.toString() })), total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) };
}
export async function taskList(input: unknown) {
  const query = adminListQuery.parse(input);
  const where: Prisma.CollectionTaskWhereInput = { ...(query.status && { status: query.status }), ...(query.q && { OR: [{ id: { contains: query.q } }, { requestKey: { contains: query.q } }] }) };
  const [total, items] = await db.$transaction([db.collectionTask.count({ where }), db.collectionTask.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize })]);
  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) };
}
