import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { db } from "@/lib/db";
import { CategoryIcon } from "@/components/icons";
import { PageHeading } from "@/components/page-heading";
export const metadata: Metadata = { title: "精选合集" };
export default async function Collections() {
  const collections = await db.collection.findMany({ where: { status: "PUBLISHED" }, orderBy: { slug: "asc" }, include: { _count: { select: { items: { where: { skill: { status: "PUBLISHED" } } } } } } });
  return <div className="shell page-content"><PageHeading eyebrow="CURATED COLLECTIONS" title="一个目标，一组好工具" description="围绕科研、教学、办公与编程，整理可继续探索的项目。" /><div className="collection-grid">{collections.map(c => <Link className="collection-card" key={c.id} href={`/collections/${c.slug}`}><CategoryIcon name={c.icon} size={28} /><h3>{c.title}</h3><p>{c.description}</p><span className="collection-meta">{c._count.items} 个项目 <ArrowUpRight size={18} /></span></Link>)}</div></div>;
}
