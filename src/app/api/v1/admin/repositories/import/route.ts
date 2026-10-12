import { db } from "@/lib/db";
import { handleApi } from "@/lib/api";
import { manager, jsonBody, idempotencyKey, adminJson } from "@/lib/admin";
import { enqueueTask } from "@/server/collector/service";
export async function POST(request: Request) { return handleApi(async () => { const actor = await manager(); const result = await enqueueTask(db, actor.id, await jsonBody(request), "IMPORT", idempotencyKey(request)); return adminJson(result, 202); }); }
