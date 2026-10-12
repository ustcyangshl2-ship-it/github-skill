import type { Metadata } from "next";
import Link from "next/link";
import { SearchBox } from "@/components/search";
import { SkillCard } from "@/components/skill-card";
import { PageHeading } from "@/components/page-heading";
import { categories, listSkills } from "@/server/catalog";
import { catalogQuerySchema, type CatalogQuery } from "@/lib/validation";
export const metadata: Metadata = { title: "Skill 目录" };
function link(query: CatalogQuery, changes: Partial<CatalogQuery>) {
  const values = { ...query, ...changes };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== "") params.set(key, String(value));
  return `/skills?${params}`;
}
export default async function Catalog({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const parsed = catalogQuerySchema.safeParse(params);
  if (!parsed.success) return <div className="shell page-content"><PageHeading eyebrow="EXPLORE" title="筛选条件无效" description="关键词最长 100 字；页码应为正整数。请调整后重新搜索。" /><SearchBox /><Link href="/skills" className="back-link">重置筛选</Link></div>;
  const query = parsed.data;
  const [result, cats] = await Promise.all([listSkills(query), categories()]);
  return <div className="shell page-content"><PageHeading eyebrow="THE DIRECTORY" title="发现适合你的 AI 能力" description="按场景寻找项目，查看中文解读，再到源仓库了解使用条件。" />
    <form action="/skills" className="search-box" role="search"><input aria-label="搜索目录" name="q" defaultValue={query.q} maxLength={100} placeholder="搜索 Skill、工具、关键词…" />{query.category && <input type="hidden" name="category" value={query.category} />}{query.type && <input type="hidden" name="type" value={query.type} />}<input type="hidden" name="sort" value={query.sort} /><button type="submit">搜索</button></form>
    <div className="filter-bar"><Link className={`filter-chip ${!query.category ? "active" : ""}`} href={link(query, { category: undefined, page: 1 })}>全部方向</Link>{cats.map(c => <Link key={c.id} className={`filter-chip ${query.category === c.slug ? "active" : ""}`} href={link(query, { category: c.slug, page: 1 })}>{c.name} {c._count.skills}</Link>)}</div>
    <div className="catalog-options"><span>{query.q && `“${query.q}” · `}找到 {result.total} 个项目</span><form action="/skills" className="flex items-center gap-2 flex-wrap"><input type="hidden" name="q" value={query.q} />{query.category && <input type="hidden" name="category" value={query.category} />}<select name="type" defaultValue={query.type ?? ""} className="select-control" aria-label="资源类型"><option value="">全部类型</option><option value="SKILL">Skill</option><option value="TOOL">工具</option><option value="FRAMEWORK">框架</option></select><select name="sort" defaultValue={query.sort} className="select-control" aria-label="排序方式"><option value="stars">Star 优先</option><option value="recent">最近更新</option><option value="editor">编辑精选优先</option></select><button className="filter-chip" type="submit">应用</button></form></div>
    <p className="notice">Star / Fork 为带日期的 GitHub 快照，非实时。编辑精选与难度建议不是安装、兼容性或效果验证。</p>
    {result.items.length ? <div className="skill-grid">{result.items.map(s => <SkillCard key={s.id} skill={s} />)}</div> : <div className="empty"><h2>没有找到匹配项目</h2><p>尝试缩短关键词，或切换使用方向。</p><Link href="/skills">查看全部项目 →</Link></div>}
    {result.totalPages > 1 && <nav className="pagination" aria-label="目录分页">{query.page > 1 && <Link href={link(query, { page: query.page - 1 })}>上一页</Link>}<span className="p-2">第 {query.page} / {result.totalPages} 页</span>{query.page < result.totalPages && <Link href={link(query, { page: query.page + 1 })}>下一页</Link>}</nav>}
  </div>;
}
