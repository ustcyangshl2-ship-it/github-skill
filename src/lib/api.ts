import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AdminError } from "@/server/collector/service";
export function failure(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}
export async function handleApi(action: () => Promise<NextResponse>) {
  try { return await action(); }
  catch (error) {
    if (error instanceof AdminError) return failure(error.code, error.message, error.status);
    if (error instanceof ZodError) return failure("INVALID_INPUT", "请求参数无效，请检查关键词、筛选条件或分页", 400);
    console.error("[SkillHub] API dependency failure", error instanceof Error ? error.name : "UnknownError");
    return failure("SERVICE_UNAVAILABLE", "数据服务暂不可用，请稍后重试", 503);
  }
}
