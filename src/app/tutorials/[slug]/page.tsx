import { notFound } from "next/navigation";
import { readTutorial } from "@/server/tutorials";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
export default async function TutorialDetail({ params }: { params: Promise<{ slug: string }> }) {
  const result = await readTutorial((await params).slug);
  if (result.status === "missing") notFound();
  return <div className="shell page-content article"><PageHeading eyebrow="THE LEARNING GUIDE" title={result.tutorial.title} description={result.tutorial.excerpt} /><Badge>{result.tutorial.access === "FREE" ? "免费阅读" : "会员教程"}</Badge>{result.status === "readable" ? <article className="panel mt-6"><div className="prose-text">{result.text}</div></article> : <div className="empty mt-6"><h2>{result.status === "locked" ? "需要有效会员权限" : "教程正文待建设"}</h2><p>{result.status === "locked" ? "正文由服务端权限控制。会员业务尚在建设中。" : "尚未提供正文内容。"}</p></div>}</div>;
}
