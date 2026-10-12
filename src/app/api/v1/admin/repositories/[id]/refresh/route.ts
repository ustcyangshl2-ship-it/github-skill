import { db } from "@/lib/db";
import { handleApi } from "@/lib/api";
import { manager, requireOrigin, idempotencyKey, adminJson } from "@/lib/admin";
import { refreshRepository } from "@/server/collector/service";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handleApi(async () => { const actor = await manager(); requireOrigin(request); return adminJson(await refreshRepository(db, actor.id, (await context.params).id, idempotencyKey(request)), 202); }); }
