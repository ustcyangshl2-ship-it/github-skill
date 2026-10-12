import { db } from "@/lib/db";
import { handleApi, failure } from "@/lib/api";
import { manager, adminJson } from "@/lib/admin";
import { adminListQuery } from "@/server/collector/contracts";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return handleApi(async () => {
  await manager(); const id = (await context.params).id; const query = adminListQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  if (!await db.collectionTask.findUnique({ where: { id }, select: { id: true } })) return failure("NOT_FOUND", "任务不存在", 404);
  const [total, items] = await db.$transaction([db.collectionTaskItem.count({ where: { taskId: id } }), db.collectionTaskItem.findMany({ where: { taskId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize })]);
  return adminJson({ items: items.map(i => ({ ...i, githubId: i.githubId?.toString() ?? null })), total, page: query.page, pageSize: query.pageSize });
}); }
