import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";
import { skillBySlug } from "@/server/catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/page-heading";
import { date, number, typeNames, difficultyNames } from "@/lib/utils";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const skill = await skillBySlug((await params).slug);
  return { title: skill?.title ?? "项目不存在" };
}
export default async function SkillDetail({ params }: { params: Promise<{ slug: string }> }) {
  const skill = await skillBySlug((await params).slug);
  if (!skill) notFound();
  const repo = skill.repository;
  const difficulty = skill.reviewedAt && skill.difficulty ? difficultyNames[skill.difficulty] : "待审核";
  return <div className="shell page-content"><Link className="back-link" href="/skills"><ArrowLeft size={14} />返回目录</Link><PageHeading eyebrow={`${typeNames[skill.type]} / ${repo.fullName}`} title={skill.title} description={skill.summaryZh || "中文解读待人工审核。当前展示原始仓库资料。"} /><div className="detail-tags">{skill.categories.map(({ category }) => <Badge key={category.id}>{category.name}</Badge>)}{skill.tags.map(({ tag }) => <Badge key={tag.id}>{tag.name}</Badge>)}</div>
    <div className="detail-grid"><div className="detail-main"><section className="panel"><h2>中文解读</h2><p className="prose-text">{skill.descriptionZh || "中文草稿已进入待审队列，未经人工审核不会展示。请先阅读下方原始介绍和 GitHub 文档。"}</p></section><section className="panel"><h2>原始介绍</h2><p className="prose-text">{repo.description || "原项目未提供描述，请阅读 GitHub README。"}</p></section><section className="panel"><h2>适合谁 · 可以探索什么</h2><p className="text-sm text-muted-foreground mb-4">经过审核的建议会在这里展示，当前内容待审核。</p><div className="detail-tags">{skill.audience.map(a => <Badge key={a}>{a}</Badge>)}</div><ul className="list-points">{skill.scenarios.map(s => <li key={s}>{s}</li>)}</ul></section><section className="panel"><h2>教程</h2>{skill.tutorials.length ? skill.tutorials.map(t => <Link className="block py-3" key={t.slug} href={`/tutorials/${t.slug}`}>{t.title} · {t.access === "FREE" ? "免费" : "会员"} →</Link>) : <p className="text-muted-foreground">该项目的专项教程待建设。可先阅读<Link className="text-primary underline" href="/tutorials/read-an-ai-repository">仓库筛选入门指南</Link>。</p>}</section><section className="panel"><h2>评测透明度</h2>{skill.reviews.length ? skill.reviews.map(r => <div key={r.id} className="mb-4"><h3>{r.title} · {r.verification === "NOT_TESTED" ? "未实测" : r.verification === "VERIFIED" ? "已验证（查看证据）" : "已测试（查看记录）"}</h3><p className="prose-text">{r.body}</p>{r.testedAt && <p>测试日期：{date(r.testedAt)}</p>}{r.evidence && <p className="prose-text">证据：{r.evidence}</p>}</div>) : <div className="notice mb-0"><ShieldCheck size={16} className="inline mr-2" />未实测。本站尚无安装、运行效果与兼容性证据，不提供“已验证”标记或虚构质量分。</div>}</section></div>
    <aside><section className="panel"><h2>源项目信息</h2><dl className="metadata"><div><dt>Star 快照</dt><dd>{number(repo.stars)}</dd></div><div><dt>Fork 快照</dt><dd>{number(repo.forks)}</dd></div><div><dt>许可证</dt><dd>{repo.licenseSpdx === "NOASSERTION" ? `${repo.licenseName ?? "自定义许可"}（需阅读全文）` : repo.licenseSpdx ?? "未识别，请核查原项目"}</dd></div><div><dt>难度建议</dt><dd>{difficulty}</dd></div><div><dt>平台线索</dt><dd>{skill.reviewedAt ? skill.platforms.map(p => p.platform.name).join("、") || "待核查" : "请核对源 README"}</dd></div><div><dt>源仓库更新</dt><dd>{date(repo.sourceUpdatedAt)}</dd></div><div><dt>快照采集</dt><dd>{date(repo.fetchedAt)}</dd></div><div><dt>归档状态</dt><dd>{repo.archived ? "已归档" : "未归档"}</dd></div></dl><Button asChild className="w-full mt-6"><a href={repo.url} target="_blank" rel="noopener noreferrer">访问 GitHub <ExternalLink size={15} /></a></Button><p className="text-xs text-muted-foreground mt-4">核对当前 README 和许可证后再使用；本站不下载或执行仓库代码。</p></section></aside></div>
  </div>;
}
