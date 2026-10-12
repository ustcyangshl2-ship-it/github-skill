import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, LockKeyhole } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
export const metadata: Metadata = { title: "教程中心" };
export default async function Tutorials() {
  const tutorials = await db.tutorial.findMany({ where: { status: "PUBLISHED" }, select: { id: true, slug: true, title: true, excerpt: true, access: true }, orderBy: { publishedAt: "desc" } });
  return <div className="shell page-content"><PageHeading eyebrow="LEARN WITH CONTEXT" title="让收藏，变成理解" description="先读懂项目，再验证能力。免费入门指南与更深入的学习内容。" /><div className="tutorial-grid">{tutorials.map(t => <article className="panel tutorial-card" key={t.id}><BookOpen className="text-primary" /><Badge>{t.access === "FREE" ? "免费指南" : "会员教程"}</Badge><h2>{t.title}</h2><p>{t.excerpt}</p><Link className="flex gap-2 items-center text-primary" href={`/tutorials/${t.slug}`}>阅读教程 <ArrowRight size={15} /></Link></article>)}<article className="panel tutorial-card"><LockKeyhole className="text-muted-foreground" /><Badge>待建设</Badge><h2>会员进阶教程</h2><p>具体项目的配置、应用案例与实测记录将逐步建设。当前没有已交付的会员教程或付费开通服务。</p></article></div></div>;
}
