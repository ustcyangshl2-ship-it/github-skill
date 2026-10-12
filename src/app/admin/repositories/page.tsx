import Link from "next/link";
import { managerPage } from "@/lib/admin";
import { repositoryList } from "@/server/collector/queries";
import { repoListQuery } from "@/server/collector/contracts";
import { PageHeading } from "@/components/page-heading";
import { AdminNav } from "@/components/admin-nav";
import { CollectorForms, CollectorAction } from "@/components/collector-controls";
import { time } from "@/components/admin-format";
import { number } from "@/lib/utils";
export default async function Repositories({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await managerPage(); const parsed = repoListQuery.safeParse(await searchParams);
  if (!parsed.success) return <div className="shell page-content"><AdminNav /><p className="notice">分页或筛选参数无效。</p><Link href="/admin/repositories">重置筛选</Link></div>;
  const query = parsed.data; const list = await repositoryList(query);
  function href(page: number) { return `/admin/repositories?${new URLSearchParams({ q: query.q, sync: query.sync ?? "", page: String(page) })}`; }
  return <div className="shell page-content"><PageHeading eyebrow="SOURCE MANAGEMENT" title="仓库管理与采集" description="元数据保留原始来源；新条目默认草稿。采集不运行第三方代码，也不发布 AI 生成内容。" /><AdminNav /><CollectorForms /><section className="panel mt-6"><form className="admin-search" action="/admin/repositories"><input name="q" aria-label="搜索仓库" placeholder="搜索仓库名称或原始描述" defaultValue={query.q} /><select name="sync" defaultValue={query.sync ?? ""} aria-label="采集状态"><option value="">全部采集状态</option><option value="enabled">允许自动发现更新</option><option value="disabled">已暂停自动发现更新</option></select><button type="submit" className="filter-chip">筛选</button></form><p className="text-xs text-muted-foreground mb-4">共 {list.total} 个仓库 · 第 {list.page} / {Math.max(1, list.totalPages)} 页</p><div className="table-wrap"><table className="admin-table"><thead><tr><th>仓库 / 唯一 ID</th><th>Star / Fork</th><th>许可证</th><th>内容状态</th><th>README</th><th>采集时间</th><th>操作</th></tr></thead><tbody>{list.items.map(r => <tr key={r.id}><td><Link href={`/admin/repositories/${r.id}`} className="text-primary font-medium">{r.fullName}</Link><small>{r.githubId}</small>{!r.syncEnabled && <small>自动发现更新已暂停</small>}</td><td>{number(r.stars)} / {number(r.forks)}</td><td>{r.licenseSpdx ?? "未识别"}</td><td>{r.skill?.status === "PUBLISHED" ? "公开元数据" : "草稿 / 待分类"}</td><td>{r.readmeState}</td><td>{time(r.fetchedAt)}</td><td><CollectorAction path={`/api/v1/admin/repositories/${r.id}/refresh`} label="刷新" /></td></tr>)}</tbody></table></div>{!list.items.length && <div className="empty">没有匹配仓库。</div>}<nav className="pagination" aria-label="仓库分页">{list.page > 1 && <Link href={href(list.page - 1)}>上一页</Link>}{list.page < list.totalPages && <Link href={href(list.page + 1)}>下一页</Link>}</nav></section></div>;
}
