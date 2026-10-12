import { handleApi } from "@/lib/api";
import { manager, adminJson } from "@/lib/admin";
import { taskList } from "@/server/collector/queries";
export async function GET(request: Request) { return handleApi(async () => { await manager(); return adminJson(await taskList(Object.fromEntries(new URL(request.url).searchParams))); }); }
