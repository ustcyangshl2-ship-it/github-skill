import Link from "next/link";
import { db } from "@/lib/db";
import { managerPage } from "@/lib/admin";
import { taskList } from "@/server/collector/queries";
import { adminListQuery } from "@/server/collector/contracts";
import { PageHeading } from "@/components/page-heading";
import { AdminNav } from "@/components/admin-nav";
import { TaskBadge, taskNames, kindNames, time } from "@/components/admin-format";
import { TaskPolling } from "@/components/collector-controls";
export default async function Tasks({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await managerPage(); const parsed = adminListQuery.safeParse(await searchParams);
  if (!parsed.success) return <div className="shell page-content"><AdminNav /><p className="notice">任务筛选参数无效。</p></div>;
  const query = parsed.data; const [list, runtime] = await Promise.all([taskList(query), db.collectorRuntime.findUnique({ where: { id: "github" } })]);
  function href(page: number) { return `/admin/collection-tasks?${new URLSearchParams({ status: query.status ?? "", page: String(page) })}`; }
  return <div className="shell page-content"><PageHeading eyebrow="DURABLE COLLECTION QUEUE" title="采集任务与日志" description="分页游标、已完成仓库、重试时间与错误原因持久保存。Worker 重启可接管过期租约。" /><AdminNav /><p className="notice">Worker 最近心跳：{time(runtime?.lastHeartbeatAt)}。{runtime?.pausedUntil && runtime.pausedUntil > new Date() ? `GitHub 限速暂停至 ${time(runtime.pausedUntil)}。` : ""}任务排队并不代表已经采集成功。</p><div className="catalog-options"><form action="/admin/collection-tasks"><select name="status" defaultValue={query.status ?? ""} className="select-control" aria-label="任务状态"><option value="">全部状态</option>{Object.entries(taskNames).map(([s, name]) => <option key={s} value={s}>{name}</option>)}</select><button className="filter-chip ml-2" type="submit">筛选</button></form><TaskPolling active={list.items.some(t => ["QUEUED", "RUNNING"].includes(t.status))} /></div><div className="panel table-wrap"><table className="admin-table"><thead><tr><th>任务</th><th>状态</th><th>发现 / 已处理</th><th>新增 / 更新 / 未变</th><th>失败 / 重试</th><th>下一尝试</th></tr></thead><tbody>{list.items.map(t => <tr key={t.id}><td><Link className="text-primary" href={`/admin/collection-tasks/${t.id}`}>{kindNames[t.kind]}</Link><small>{t.id}</small><small>{time(t.createdAt)}</small></td><td><TaskBadge status={t.status} /><small>{t.errorCode ?? ""}</small></td><td>{t.discoveredCount} / {t.processedCount}</td><td>{t.createdCount} / {t.updatedCount} / {t.unchangedCount}</td><td>{t.failedCount} / {t.attempts}</td><td>{t.status === "QUEUED" ? time(t.nextAttemptAt) : "—"}</td></tr>)}</tbody></table>{!list.items.length && <div className="empty">暂无任务。前往仓库管理创建采集任务。</div>}</div><nav className="pagination" aria-label="任务分页">{list.page > 1 && <Link href={href(list.page - 1)}>上一页</Link>}<span className="p-2">{list.page} / {Math.max(list.totalPages, 1)}</span>{list.page < list.totalPages && <Link href={href(list.page + 1)}>下一页</Link>}</nav></div>;
}
