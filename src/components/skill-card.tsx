import Link from "next/link";
import { ArrowUpRight, Star, GitFork } from "lucide-react";
import type { SkillCardData } from "@/server/catalog";
import { Badge } from "@/components/ui/badge";
import { number, typeNames } from "@/lib/utils";
export function SkillCard({ skill }: { skill: SkillCardData }) {
  return <article className="skill-card"><div className="card-top"><span className={`repo-mark mark-${skill.type.toLowerCase()}`}>{skill.title.slice(0, 2)}</span><Badge>{typeNames[skill.type]}</Badge></div>
    <Link className="card-title" href={`/skills/${skill.slug}`}>{skill.title}<ArrowUpRight size={19} /></Link><p className="repo-owner">{skill.repository.fullName}</p><p className="card-description">{skill.summaryZh || skill.repository.description || "中文解读待审核，请阅读源项目文档。"}</p><div className="card-tags">{skill.tags.slice(0, 2).map(({ tag }) => <Badge key={tag.id}>{tag.name}</Badge>)}</div>
    <div className="card-footer"><span><Star size={14} />{number(skill.repository.stars)}<GitFork size={14} className="fork-icon" />{number(skill.repository.forks)}</span><span className="untested">未实测{!skill.reviewedAt && " · 中文待审"}</span></div>
  </article>;
}
