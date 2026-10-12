"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type ActionResponse = { data?: { task?: { id: string }; id?: string }; error?: { message: string } };
async function submit(path: string, body?: unknown, method = "POST"): Promise<ActionResponse> {
  const response = await fetch(path, { method, headers: { ...(body !== undefined && { "Content-Type": "application/json" }), "Idempotency-Key": crypto.randomUUID() }, ...(body !== undefined && { body: JSON.stringify(body) }) });
  const result: ActionResponse = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "操作失败");
  return result;
}
export function CollectorForms() {
  const [busy, setBusy] = useState<string>(); const [error, setError] = useState(""); const [taskId, setTaskId] = useState(""); const router = useRouter();
  async function send(event: React.FormEvent<HTMLFormElement>, kind: "import" | "discover") {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(kind); setError(""); setTaskId("");
    try { const body = kind === "import" ? { url: form.get("url") } : { query: form.get("query"), minStars: Number(form.get("minStars")), perPage: Number(form.get("perPage")), maxPages: Number(form.get("maxPages")) }; const result = await submit(`/api/v1/admin/repositories/${kind}`, body); setTaskId(result.data?.task?.id ?? ""); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "提交失败"); } finally { setBusy(undefined); }
  }
  return <><div className="tutorial-grid"><form className="panel admin-form" onSubmit={e => send(e, "import")}><h2>导入 GitHub 仓库</h2><label>仓库地址<Input name="url" type="url" required maxLength={512} placeholder="https://github.com/owner/repo" /></label><p>只采集公开元数据和 README。新条目保持草稿，中文内容需要人工审核。</p><Button type="submit" disabled={Boolean(busy)}>{busy === "import" ? "提交中…" : "加入采集队列"}</Button></form><form className="panel admin-form" onSubmit={e => send(e, "discover")}><h2>按关键词发现</h2><label>GitHub 搜索关键词<Input name="query" required minLength={2} maxLength={200} placeholder="agent-skills in:name" /></label><div className="admin-form-row"><label>最低 Star<Input type="number" name="minStars" min={0} max={10000000} defaultValue={0} /></label><label>每页数量<Input type="number" name="perPage" min={1} max={100} defaultValue={10} /></label><label>最多页数<Input type="number" name="maxPages" min={1} max={10} defaultValue={3} /></label></div><Button type="submit" disabled={Boolean(busy)}>{busy === "discover" ? "提交中…" : "创建发现任务"}</Button></form></div>{error && <p role="alert" className="notice mt-4">{error}</p>}{taskId && <p role="status" className="notice mt-4">已入队。<Link className="underline" href={`/admin/collection-tasks/${taskId}`}>查看任务进度与日志 →</Link></p>}</>;
}
export function CollectorAction({ path, label, body, method = "POST", navigate = true }: { path: string; label: string; body?: unknown; method?: string; navigate?: boolean }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const router = useRouter();
  async function act() { setBusy(true); setError(""); try { const result = await submit(path, body, method); const id = result.data?.task?.id ?? result.data?.id; if (navigate && id) router.push(`/admin/collection-tasks/${id}`); else router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); } finally { setBusy(false); } }
  return <span><Button variant="outline" size="sm" disabled={busy} onClick={act}>{busy ? "处理中…" : label}</Button>{error && <span role="alert" className="block text-xs text-red-700 mt-2">{error}</span>}</span>;
}
export function TaskPolling({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => { if (!active) return; const timer = setInterval(() => router.refresh(), 5000); return () => clearInterval(timer); }, [active, router]);
  return <Button variant="outline" size="sm" onClick={() => router.refresh()}>刷新状态{active ? "（每 5 秒更新）" : ""}</Button>;
}
