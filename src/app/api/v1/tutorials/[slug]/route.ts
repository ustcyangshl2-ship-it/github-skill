import { NextResponse } from "next/server";
import { readTutorial } from "@/server/tutorials";
import { handleApi, failure } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  return handleApi(async () => {
    const result = await readTutorial((await context.params).slug);
    if (result.status === "missing") return failure("NOT_FOUND", "教程不存在", 404);
    if (result.status === "locked") return failure("MEMBERSHIP_REQUIRED", "此教程需要有效会员权限", 403);
    if (result.status === "unfinished") return failure("CONTENT_NOT_READY", "教程正文待建设", 503);
    return NextResponse.json({ data: { ...result.tutorial, text: result.text } }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  });
}
