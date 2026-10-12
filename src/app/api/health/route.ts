import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApi } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  return handleApi(async () => {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ data: { status: "ok", database: "connected", phase: 1 } }, { headers: { "Cache-Control": "no-store" } });
  });
}
