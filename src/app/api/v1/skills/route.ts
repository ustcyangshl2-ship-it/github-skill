import { NextResponse } from "next/server";
import { catalogQuerySchema } from "@/lib/validation";
import { listSkills, publicSkill } from "@/server/catalog";
import { handleApi } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handleApi(async () => {
    const query = catalogQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { items, ...meta } = await listSkills(query);
    return NextResponse.json({ data: items.map(publicSkill), meta });
  });
}
