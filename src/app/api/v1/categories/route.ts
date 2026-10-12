import { NextResponse } from "next/server";
import { categories } from "@/server/catalog";
import { handleApi } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() { return handleApi(async () => NextResponse.json({ data: (await categories()).map(c => ({ slug: c.slug, name: c.name, count: c._count.skills })) })); }
