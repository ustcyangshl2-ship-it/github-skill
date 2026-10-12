import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { canManageContent } from "@/lib/access";
import { db } from "@/lib/db";
import { PageHeading } from "@/components/page-heading";
import { AdminNav } from "@/components/admin-nav";
export default async function Admin() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canManageContent(user.role)) return <div className="shell page-content"><PageHeading eyebrow="ACCESS CONTROL" title="没有后台访问权限" description="管理功能只向编辑及管理员开放，角色由服务端数据库验证。" /></div>;
  const [skills, tasks, pending] = await Promise.all([db.skill.count(), db.collectionTask.count(), db.aiTask.count({ where: { status: "PENDING_REVIEW" } })]);
  return <div className="shell page-content"><PageHeading eyebrow="ADMINISTRATION" title="管理工作台" description="仓库采集与任务日志已开放。AI 审核、评测、教程与会员管理分阶段建设。" /><AdminNav /><div className="admin-grid">{[["条目总数", skills], ["采集任务", tasks], ["待审 AI 草稿", pending]].map(([name, value]) => <section className="panel" key={name}><p className="text-muted-foreground">{name}</p><strong className="text-3xl">{value}</strong></section>)}</div><div className="admin-grid mt-6">{["AI 分类与摘要审核", "人工评测管理", "精选合集及教程管理", ...(user.role === "ADMIN" ? ["用户与权限管理"] : [])].map(name => <section className="panel" key={name}><h2>{name}</h2><p className="text-muted-foreground">待建设</p></section>)}</div></div>;
}
