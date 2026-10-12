import type { Metadata } from "next";
import Link from "next/link";
import { Star, ArrowUpRight } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeading } from "@/components/page-heading";
import { number, date } from "@/lib/utils";
export const metadata: Metadata = { title: "排行榜" };
export default async function Rankings({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const mode = (await searchParams).mode ?? "stars";
  if (!["stars", "editor", "growth"].includes(mode)) return <div className="shell page-content"><PageHeading eyebrow="RANKINGS" title="排行选项无效" description="请选择 Star、编辑精选或近期增长。" /><Link href="/rankings">查看 Star 排行 →</Link></div>;
  const items = mode === "growth" ? [] : await db.skill.findMany({ where: { status: "PUBLISHED", ...(mode === "editor" && { featured: true }) }, include: { repository: true }, orderBy: mode === "editor" ? [{ editorialOrder: "asc" }] : [{ repository: { stars: "desc" } }, { id: "asc" }] });
  return <div className="shell page-content"><PageHeading eyebrow="THE RANKINGS" title="看见大家关注的项目" description="用关注度发现线索，用源文档与实测判断价值。" /><div className="filter-bar">{[["stars", "Star 排行"], ["editor", "编辑精选"], ["growth", "近期增长"]].map(([key, label]) => <Link className={`filter-chip ${mode === key ? "active" : ""}`} key={key} href={`/rankings?mode=${key}`}>{label}</Link>)}</div>{mode === "growth" ? <div className="empty"><h2>近期增长待建设</h2><p>需要连续日期的真实 Star 快照及增量采集任务，当前不展示推算增长。</p></div> : <><p className="notice">以下为历史快照排序，非实时排行榜。编辑精选不是实测认证。</p><div className="rank-list">{items.map((s, i) => <Link className="rank-row" key={s.id} href={`/skills/${s.slug}`}><span className="rank-index">{String(i + 1).padStart(2, "0")}</span><div><h3>{s.title}</h3><p>{s.repository.fullName} · 快照 {date(s.repository.fetchedAt)}</p></div><span className="rank-count"><Star size={14} />{number(s.repository.stars)}<ArrowUpRight size={14} /></span></Link>)}</div></>}</div>;
}
