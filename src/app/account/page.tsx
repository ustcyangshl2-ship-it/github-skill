import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { hasMembership } from "@/lib/access";
import { PageHeading } from "@/components/page-heading";
import { db } from "@/lib/db";
import Link from "next/link";
export default async function Account() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const favorites = await db.favorite.findMany({ where: { userId: user.id, skill: { status: "PUBLISHED" } }, include: { skill: { select: { slug: true, title: true } } } });
  return <div className="shell page-content"><PageHeading eyebrow="YOUR TOOLBOX" title={`你好，${user.name ?? "学习者"}`} description="收藏与会员状态以服务端记录为准。" /><div className="tutorial-grid"><section className="panel"><h2>会员状态</h2><p>{hasMembership(user.memberships) ? "有效会员" : "当前无有效会员授权"}</p><p className="text-muted-foreground mt-4">会员开通与授权管理待建设。</p></section><section className="panel"><h2>我的收藏</h2>{favorites.length ? favorites.map(f => <Link key={f.skillId} className="block" href={`/skills/${f.skill.slug}`}>{f.skill.title}</Link>) : <p className="text-muted-foreground">尚无收藏记录。收藏操作将在后续阶段开放。</p>}</section></div></div>;
}
