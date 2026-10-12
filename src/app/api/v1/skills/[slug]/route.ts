import { NextResponse } from "next/server";
import { skillBySlug, publicSkill } from "@/server/catalog";
import { handleApi, failure } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  return handleApi(async () => {
    const skill = await skillBySlug((await context.params).slug);
    if (!skill) return failure("NOT_FOUND", "条目不存在", 404);
    return NextResponse.json({ data: { ...publicSkill(skill), reviews: skill.reviews.map(r => ({ title: r.title, body: r.body, score: r.score, verification: r.verification, testedAt: r.testedAt, environment: r.environment, evidence: r.evidence })), tutorials: skill.tutorials } });
  });
}
