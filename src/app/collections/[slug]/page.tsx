import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { skillInclude } from "@/server/catalog";
import { PageHeading } from "@/components/page-heading";
import { SkillCard } from "@/components/skill-card";
export default async function CollectionDetail({ params }: { params: Promise<{ slug: string }> }) {
  const collection = await db.collection.findFirst({ where: { slug: (await params).slug, status: "PUBLISHED" }, include: { items: { where: { skill: { status: "PUBLISHED" } }, orderBy: { position: "asc" }, include: { skill: { include: skillInclude } } } } });
  if (!collection) notFound();
  return <div className="shell page-content"><PageHeading eyebrow="THE COLLECTION" title={collection.title} description={collection.description} /><p className="notice">此合集为编辑整理的阅读清单。条目尚未完成本站实测，请核对当前源项目文档。</p><div className="skill-grid">{collection.items.map(i => <SkillCard key={i.skillId} skill={i.skill} />)}</div></div>;
}
