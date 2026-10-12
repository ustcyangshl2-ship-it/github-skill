import { Badge } from "./ui/badge";
export const taskNames: Record<string, string> = { QUEUED: "排队 / 等待重试", RUNNING: "处理中", SUCCEEDED: "已完成", FAILED: "失败", CANCELLED: "已取消" };
export const kindNames: Record<string, string> = { IMPORT: "仓库导入", DISCOVER: "关键词发现", REFRESH: "增量更新" };
export function TaskBadge({ status }: { status: string }) { return <Badge className={status === "FAILED" ? "text-red-700 bg-red-50" : status === "SUCCEEDED" ? "text-primary bg-green-50" : ""}>{taskNames[status] ?? status}</Badge>; }
export function time(value: Date | null | undefined) { return value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(value) : "—"; }
