import { db } from "@/lib/db";
import { handleApi } from "@/lib/api";
import { manager, requireOrigin, adminJson } from "@/lib/admin";
import { retryTask } from "@/server/collector/service";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handleApi(async () => { const actor = await manager(); requireOrigin(request); return adminJson(await retryTask(db, actor.id, (await context.params).id), 202); }); }
