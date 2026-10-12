import { z } from "zod";
import { db } from "@/lib/db";
import { handleApi, failure } from "@/lib/api";
import { manager, jsonBody, adminJson } from "@/lib/admin";
import { setRepositorySync } from "@/server/collector/service";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) { return handleApi(async () => {
  await manager(); const repo = await db.githubRepository.findUnique({ where: { id: (await context.params).id }, include: { skill: { select: { id: true, slug: true, status: true, type: true } } } });
  if (!repo) return failure("NOT_FOUND", "仓库不存在", 404);
  return adminJson({ ...repo, githubId: repo.githubId.toString() });
}); }
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return handleApi(async () => { const actor = await manager(); const body = z.strictObject({ syncEnabled: z.boolean() }).parse(await jsonBody(request)); const repo = await setRepositorySync(db, actor.id, (await context.params).id, body.syncEnabled); return adminJson({ id: repo.id, syncEnabled: repo.syncEnabled }); }); }
