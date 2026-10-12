import { db } from "@/lib/db";
import { handleApi, failure } from "@/lib/api";
import { manager, adminJson } from "@/lib/admin";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) { return handleApi(async () => {
  await manager(); const task = await db.collectionTask.findUnique({ where: { id: (await context.params).id } });
  return task ? adminJson(task) : failure("NOT_FOUND", "任务不存在", 404);
}); }
