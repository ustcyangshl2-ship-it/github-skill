import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type Role } from "@prisma/client";
import { discoverInput, importInput, taskPayload, type TaskPayload } from "./contracts";
import { CollectorError } from "./errors";

export type Actor = { id: string; role: Role };
export class AdminError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); this.name = "AdminError"; }
}
export async function ensureManager(prisma: PrismaClient, actorId: string) {
  const user = await prisma.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
  if (!user) throw new AdminError("UNAUTHENTICATED", 401, "请先登录");
  if (user.role !== "ADMIN" && user.role !== "EDITOR") throw new AdminError("FORBIDDEN", 403, "需要编辑或管理员权限");
  return user;
}
export function requestFingerprint(payload: TaskPayload) {
  const canonical = payload.kind === "DISCOVER" ? { kind: "DISCOVER", query: payload.query, perPage: payload.perPage, maxPages: payload.maxPages, minStars: payload.minStars } : { kind: "REPOSITORY", url: payload.url.toLowerCase() };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
export async function enqueueTask(prisma: PrismaClient, actorId: string, input: unknown, kind: "IMPORT" | "DISCOVER" | "REFRESH", idempotencyKey?: string) {
  await ensureManager(prisma, actorId);
  const payload = taskPayload.parse(kind === "IMPORT" ? { ...importInput.parse(input), kind } : kind === "DISCOVER" ? { ...discoverInput.parse(input), kind } : input);
  if (payload.kind !== kind) throw new AdminError("TASK_KIND_MISMATCH", 400, "任务类型与参数不一致");
  const requestKey = requestFingerprint(payload);
  const dedupeKey = idempotencyKey ? createHash("sha256").update(`${actorId}:${idempotencyKey}`).digest("hex") : randomUUID();
  const repeat = await prisma.collectionTask.findUnique({ where: { dedupeKey } });
  if (repeat) {
    if (repeat.requestKey !== requestKey) throw new AdminError("IDEMPOTENCY_CONFLICT", 409, "同一幂等键不能用于不同请求");
    return { task: repeat, reused: true };
  }
  const active = await prisma.collectionTask.findFirst({ where: { requestKey, status: { in: ["QUEUED", "RUNNING"] } } });
  if (active) return { task: active, reused: true };
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(7534013)::text`;
      const replay = await tx.collectionTask.findFirst({ where: { OR: [{ dedupeKey }, { requestKey, status: { in: ["QUEUED", "RUNNING"] } }] } });
      if (replay) { if (replay.requestKey !== requestKey) throw new AdminError("IDEMPOTENCY_CONFLICT", 409, "幂等请求冲突"); return { task: replay, reused: true }; }
      const recent = await tx.auditLog.count({ where: { actorId, action: { in: ["COLLECTION_ENQUEUE", "COLLECTION_RETRY"] }, createdAt: { gte: new Date(Date.now() - 60000) } } });
      if (recent >= 10 || await tx.collectionTask.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } }) >= 100) throw new AdminError("QUEUE_LIMIT", 429, "提交过于频繁或队列已满，请稍后再试");
      const created = await tx.collectionTask.create({ data: { kind, payload, requestKey, dedupeKey, requestedById: actorId, searchComplete: kind !== "DISCOVER", ...(kind !== "DISCOVER" && { discoveredCount: 1, items: { create: { url: payload.kind === "DISCOVER" ? "" : payload.url, ...(payload.kind === "REFRESH" && { githubId: BigInt(payload.githubId) }) } } }), logs: { create: { level: "INFO", message: "任务已入队", details: { event: "ENQUEUED", kind } } } } });
      await tx.auditLog.create({ data: { actorId, action: "COLLECTION_ENQUEUE", entityType: "CollectionTask", entityId: created.id, changes: { kind, requestKey } } });
      return { task: created, reused: false };
    });
    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.collectionTask.findFirst({ where: { OR: [{ dedupeKey }, { requestKey, status: { in: ["QUEUED", "RUNNING"] } }] } });
      if (existing && existing.requestKey === requestKey) return { task: existing, reused: true };
      throw new AdminError("IDEMPOTENCY_CONFLICT", 409, "幂等请求冲突");
    }
    throw error;
  }
}
export async function refreshRepository(prisma: PrismaClient, actorId: string, id: string, key?: string) {
  await ensureManager(prisma, actorId);
  const repository = await prisma.githubRepository.findUnique({ where: { id } });
  if (!repository) throw new AdminError("NOT_FOUND", 404, "仓库不存在");
  return enqueueTask(prisma, actorId, { kind: "REFRESH", url: repository.url, repositoryId: id, githubId: repository.githubId.toString() }, "REFRESH", key);
}
export async function retryTask(prisma: PrismaClient, actorId: string, id: string) {
  await ensureManager(prisma, actorId);
  const recent = await prisma.auditLog.count({ where: { actorId, action: { in: ["COLLECTION_ENQUEUE", "COLLECTION_RETRY"] }, createdAt: { gte: new Date(Date.now() - 60000) } } });
  if (recent >= 10) throw new AdminError("QUEUE_LIMIT", 429, "重试过于频繁");
  try {
    return await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(7534013)::text`;
      if (await tx.collectionTask.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } }) >= 100) throw new AdminError("QUEUE_LIMIT", 429, "队列已满");
      if (await tx.auditLog.count({ where: { actorId, action: { in: ["COLLECTION_ENQUEUE", "COLLECTION_RETRY"] }, createdAt: { gte: new Date(Date.now() - 60000) } } }) >= 10) throw new AdminError("QUEUE_LIMIT", 429, "重试过于频繁");
      const task = await tx.collectionTask.findUnique({ where: { id } });
      if (!task) throw new AdminError("NOT_FOUND", 404, "任务不存在");
      if (task.status !== "FAILED") throw new AdminError("TASK_NOT_RETRYABLE", 409, "只有失败任务可以重新入队");
      const failed = await tx.collectionTaskItem.count({ where: { taskId: id, status: "FAILED" } });
      const changed = await tx.collectionTask.updateMany({ where: { id, status: "FAILED" }, data: { status: "QUEUED", nextAttemptAt: new Date(), leaseToken: null, leaseUntil: null, errorCode: null, retryScope: null, finishedAt: null, stepAttempts: 0, failedCount: { decrement: failed }, processedCount: { decrement: failed } } });
      if (changed.count !== 1) throw new AdminError("TASK_CONFLICT", 409, "任务状态已改变");
      await tx.collectionTaskItem.updateMany({ where: { taskId: id, status: "FAILED" }, data: { status: "QUEUED", attempts: 0, errorCode: null } });
      await tx.collectionTaskLog.create({ data: { taskId: id, level: "INFO", message: "管理员重新入队，保留已完成进度", details: { event: "MANUAL_RETRY", failedItems: failed } } });
      await tx.auditLog.create({ data: { actorId, action: "COLLECTION_RETRY", entityType: "CollectionTask", entityId: id } });
      return tx.collectionTask.findUniqueOrThrow({ where: { id } });
    });
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AdminError("ACTIVE_TASK_EXISTS", 409, "相同采集请求已有活动任务"); throw error; }
}
export async function setRepositorySync(prisma: PrismaClient, actorId: string, id: string, enabled: boolean) {
  await ensureManager(prisma, actorId);
  return prisma.$transaction(async tx => {
    const repo = await tx.githubRepository.findUnique({ where: { id } });
    if (!repo) throw new AdminError("NOT_FOUND", 404, "仓库不存在");
    const changed = await tx.githubRepository.update({ where: { id }, data: { syncEnabled: enabled } });
    await tx.auditLog.create({ data: { actorId, action: "REPOSITORY_SYNC_CHANGE", entityType: "GithubRepository", entityId: id, changes: { syncEnabled: { before: repo.syncEnabled, after: enabled } } } });
    return changed;
  });
}
export function chinaSnapshotDay(now: Date) {
  return new Date(`${new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(now)}T00:00:00Z`);
}
export function safeInternalError(error: unknown): CollectorError {
  if (error instanceof CollectorError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return new CollectorError("REPOSITORY_IDENTITY_CONFLICT");
  return new CollectorError("COLLECTOR_INTERNAL_ERROR", true);
}
