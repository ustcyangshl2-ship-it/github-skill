import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, CircleCheck, Sparkles, Star, TrendingUp } from "lucide-react";
import { db } from "@/lib/db";
import { categories, skillInclude } from "@/server/catalog";
import { date, number } from "@/lib/utils";
import { CategoryIcon } from "@/components/icons";
import { SearchBox } from "@/components/search";
import { SkillCard } from "@/components/skill-card";

export default async function Home() {
  const [cats, featured, popular, collections, count, latest] = await Promise.all([
    categories(), db.skill.findMany({ where: { status: "PUBLISHED", featured: true }, include: skillInclude, orderBy: { editorialOrder: "asc" }, take: 3 }),
    db.skill.findMany({ where: { status: "PUBLISHED" }, include: skillInclude, orderBy: { repository: { stars: "desc" } }, take: 4 }),
    db.collection.findMany({ where: { status: "PUBLISHED" }, take: 2, orderBy: { slug: "asc" }, include: { _count: { select: { items: { where: { skill: { status: "PUBLISHED" } } } } } } }),
    db.skill.count({ where: { status: "PUBLISHED" } }), db.githubRepository.findFirst({ orderBy: { fetchedAt: "desc" }, select: { fetchedAt: true } })
  ]);
  return <div className="shell"><section className="hero"><div><p className="eyebrow"><span className="eyebrow-dot" /> CURATED FOR YOUR NEXT IDEA</p><h1>找到下一项<br />值得掌握的 <em>AI 能力。</em></h1><p className="hero-description">发现公开 AI 项目，读懂它的来源与使用条件。<br />为科研、教学、办公与编程，寻找适合你的 Skill 和工具。</p><SearchBox large /><p className="quick-searches"><span>试试搜索</span>{["Agent Skills", "文档", "RAG", "工作流"].map(q => <Link href={`/skills?q=${encodeURIComponent(q)}`} key={q}>{q}</Link>)}</p></div><aside className="spotlight"><p className="overline"><Sparkles size={15} /> THE SKILL STARTER</p><h2>从一个 Skill 开始，<br />打开更多可能。</h2><p>认识可复用的 AI 技能，先读懂它的能力、来源与使用条件。</p><Link className="spotlight-link" href={featured[0] ? `/skills/${featured[0].slug}` : "/skills"}><span>{featured[0]?.title ?? "探索 Skill 目录"}</span><ArrowUpRight size={22} /></Link></aside></section>
    <div className="stats-strip"><span><strong>{count}</strong> 公开项目</span><span><strong>{cats.length}</strong> 使用方向</span><span><CircleCheck size={13} className="inline mr-1" /> 保留来源与许可证</span><span className="stats-source">GitHub 元数据快照 {latest ? date(latest.fetchedAt) : "暂无"} · 非实时</span></div>
    <section className="section"><div className="section-heading"><div><h2>从你的场景出发</h2><p>不必先懂技术名词，先找到你想做的事。</p></div><Link href="/skills">全部分类 <ArrowRight size={14} /></Link></div><div className="category-grid">{cats.map(c => <Link className="category-tile" key={c.id} href={`/skills?category=${c.slug}`}><CategoryIcon name={c.icon} /><h3>{c.name}</h3><p>{c._count.skills} 个项目 <ArrowUpRight size={11} className="inline ml-1" /></p></Link>)}</div></section>
    <section className="section"><div className="section-heading"><div><h2><Sparkles size={19} /> 编辑精选</h2><p>初始化阅读清单 · 中文草稿待人工审核，项目均未实测。</p></div><Link href="/skills?sort=editor">探索更多 <ArrowRight size={14} /></Link></div><div className="skill-grid">{featured.map(skill => <SkillCard key={skill.id} skill={skill} />)}</div></section>
    <div className="home-bottom"><section className="section"><div className="section-heading"><div><h2><TrendingUp size={19} /> 热门项目</h2><p>按快照 Star 排序，关注度不等于质量。</p></div><Link href="/rankings">查看排行 <ArrowRight size={14} /></Link></div><div className="rank-list">{popular.map((s, i) => <Link className="rank-row" key={s.id} href={`/skills/${s.slug}`}><span className="rank-index">0{i + 1}</span><div><h3>{s.title}</h3><p>{s.categories[0]?.category.name}</p></div><span className="rank-count"><Star size={13} />{number(s.repository.stars)}</span></Link>)}</div></section><section className="section"><div className="section-heading"><div><h2>精选合集</h2><p>围绕一个目标，收好一组工具。</p></div><Link href="/collections">全部合集 <ArrowRight size={14} /></Link></div><div className="collection-grid">{collections.map(c => <Link className="collection-card" key={c.id} href={`/collections/${c.slug}`}><CategoryIcon name={c.icon} /><h3>{c.title}</h3><p>{c.description}</p><span className="collection-meta">{c._count.items} 个项目 <ArrowUpRight size={17} /></span></Link>)}</div></section></div>
    <div className="learning-banner"><BookOpen size={30} /><div><h3>不只收藏，也读懂它。</h3><p>第一次看 AI 仓库？从来源、许可证和验证证据开始。</p></div><Link href="/tutorials/read-an-ai-repository">阅读免费指南 <ArrowRight size={17} /></Link></div>
  </div>;
}
