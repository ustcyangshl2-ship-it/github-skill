import { createHash, randomUUID } from "node:crypto";
import { type CollectionTask, type CollectionTaskItem, type PrismaClient, type Prisma } from "@prisma/client";
import { GithubClient, githubRetryAt } from "./github";
import { taskPayload, type RepositoryMetadata } from "./contracts";
import { CollectorError, retryTime } from "./errors";
import { chinaSnapshotDay, safeInternalError } from "./service";

export class CollectorWorker {
  private now: () => Date;
  constructor(private prisma: PrismaClient, private options: { fetch?: typeof fetch; token?: string; now?: () => Date; intervalMs?: number } = {}) { this.now = options.now ?? (() => new Date()); }
  private async log(tx: Prisma.TransactionClient, taskId: string, message: string, details: Prisma.InputJsonObject, level = "INFO") {
    await tx.collectionTaskLog.create({ data: { taskId, level, message, details } });
  }
  private async guarded(tx: Prisma.TransactionClient, task: CollectionTask) {
    const current = await tx.collectionTask.findUnique({ where: { id: task.id }, select: { status: true, leaseToken: true, leaseUntil: true } });
    const runtime = await tx.collectorRuntime.findUnique({ where: { id: "github" } });
    if (current?.status !== "RUNNING" || current.leaseToken !== task.leaseToken || !current.leaseUntil || current.leaseUntil <= this.now() || runtime?.leaseToken !== task.leaseToken) throw new CollectorError("LEASE_LOST");
  }
  private async claim() {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(7534012)::text`;
      const now = this.now();
      const credentialsKey = createHash("sha256").update(this.options.token ?? "anonymous").digest("hex");
      let runtime = await tx.collectorRuntime.upsert({ where: { id: "github" }, create: { id: "github", lastHeartbeatAt: now, credentialsKey }, update: { lastHeartbeatAt: now } });
      if (runtime.credentialsKey !== credentialsKey && (!runtime.leaseUntil || runtime.leaseUntil <= now)) {
        const primary = runtime.pauseScope === "PRIMARY";
        runtime = await tx.collectorRuntime.update({ where: { id: "github" }, data: { credentialsKey, ...(primary && { pausedUntil: null, pauseReason: null, pauseScope: null }) } });
        if (primary) await tx.collectionTask.updateMany({ where: { status: "QUEUED", retryScope: "PRIMARY", errorCode: "GITHUB_RATE_LIMITED" }, data: { nextAttemptAt: now } });
      }
      if ((runtime.leaseUntil && runtime.leaseUntil > now) || (runtime.pausedUntil && runtime.pausedUntil > now) || runtime.nextRequestAt > now) return null;
      const task = await tx.collectionTask.findFirst({ where: { OR: [{ status: "QUEUED", nextAttemptAt: { lte: now } }, { status: "RUNNING", leaseUntil: { lte: now } }] }, orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }] });
      if (!task) return null;
      const token = randomUUID(); const until = new Date(now.getTime() + 120000);
      const claimed = await tx.collectionTask.update({ where: { id: task.id }, data: { status: "RUNNING", leaseToken: token, leaseUntil: until } });
      await tx.collectorRuntime.update({ where: { id: "github" }, data: { leaseToken: token, leaseUntil: until, pausedUntil: null, pauseReason: null, pauseScope: null } });
      await this.log(tx, task.id, task.status === "RUNNING" ? "接管过期租约，恢复已保存进度" : "Worker 领取任务步骤", { event: task.status === "RUNNING" ? "LEASE_RECOVERED" : "CLAIMED", page: task.page });
      return claimed;
    });
  }
  private client(task: CollectionTask) {
    return new GithubClient({ token: this.options.token, fetch: this.options.fetch, now: this.now, hooks: {
      beforeRequest: async () => {
        const runtime = await this.prisma.collectorRuntime.findUniqueOrThrow({ where: { id: "github" } });
        if (runtime.leaseToken !== task.leaseToken) throw new CollectorError("LEASE_LOST");
        const wait = Math.max(runtime.nextRequestAt.getTime(), runtime.pausedUntil?.getTime() ?? 0) - this.now().getTime();
        if (wait > 1500) throw new CollectorError("GITHUB_RATE_LIMITED", true, new Date(this.now().getTime() + wait), undefined, runtime.pauseScope === "PRIMARY" ? "PRIMARY" : "SECONDARY");
        if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
        await this.prisma.collectorRuntime.updateMany({ where: { id: "github", leaseToken: task.leaseToken }, data: { nextRequestAt: new Date(this.now().getTime() + (this.options.intervalMs ?? 1100)) } });
      },
      observe: async headers => {
        const pause = githubRetryAt(headers, this.now());
        if (pause) await this.prisma.collectorRuntime.updateMany({ where: { id: "github", leaseToken: task.leaseToken }, data: { pausedUntil: pause, pauseReason: "GITHUB_RATE_LIMITED", pauseScope: !headers.has("retry-after") && headers.get("x-ratelimit-remaining") === "0" ? "PRIMARY" : "SECONDARY" } });
      }
    } });
  }
  private async release(task: CollectionTask, data: Prisma.CollectionTaskUpdateManyMutationInput = {}) {
    await this.prisma.$transaction(async tx => {
      await this.guarded(tx, task);
      const runtime = await tx.collectorRuntime.findUniqueOrThrow({ where: { id: "github" } });
      await tx.collectionTask.updateMany({ where: { id: task.id, leaseToken: task.leaseToken }, data: { status: "QUEUED", leaseToken: null, leaseUntil: null, errorCode: null, retryScope: null, nextAttemptAt: new Date(Math.max(this.now().getTime(), runtime.nextRequestAt.getTime())), ...data } });
      await tx.collectorRuntime.updateMany({ where: { id: "github", leaseToken: task.leaseToken }, data: { leaseToken: null, leaseUntil: null } });
    });
  }
  private async saveMetadata(task: CollectionTask, item: CollectionTaskItem, metadata: RepositoryMetadata | null, etag: string | null) {
    return this.prisma.$transaction(async tx => {
      await this.guarded(tx, task);
      const existing = metadata ? await tx.githubRepository.findUnique({ where: { githubId: BigInt(metadata.id) } }) : item.githubId ? await tx.githubRepository.findUnique({ where: { githubId: item.githubId } }) : await tx.githubRepository.findFirst({ where: { url: { equals: item.url, mode: "insensitive" } } });
      if (!metadata && !existing) throw new CollectorError("UNEXPECTED_NOT_MODIFIED", true);
      let repository = existing;
      let result = "UNCHANGED";
      if (metadata) {
        const data = { fullName: metadata.full_name, url: metadata.html_url, description: metadata.description, topics: metadata.topics, stars: metadata.stargazers_count, forks: metadata.forks_count, licenseSpdx: metadata.license?.spdx_id ?? null, licenseName: metadata.license?.name ?? null, sourceUpdatedAt: new Date(metadata.updated_at), archived: metadata.archived };
        const contentChanged = existing && (existing.description !== data.description || JSON.stringify(existing.topics) !== JSON.stringify(data.topics) || existing.licenseSpdx !== data.licenseSpdx || existing.archived !== data.archived || existing.fullName !== data.fullName);
        const changed = !existing || contentChanged || existing.stars !== data.stars || existing.forks !== data.forks || existing.sourceUpdatedAt.getTime() !== data.sourceUpdatedAt.getTime();
        result = !existing ? "CREATED" : changed ? "UPDATED" : "UNCHANGED";
        repository = await tx.githubRepository.upsert({ where: { githubId: BigInt(metadata.id) }, create: { githubId: BigInt(metadata.id), ...data, fetchedAt: this.now(), etag }, update: { ...data, fetchedAt: this.now(), etag, ...(contentChanged && { contentVersion: { increment: 1 } }) } });
        await tx.skill.upsert({ where: { repositoryId: repository.id }, create: { repositoryId: repository.id, slug: `github-${metadata.id}`, title: metadata.full_name, summaryZh: "", descriptionZh: "", type: "UNKNOWN", difficulty: null, audience: [], scenarios: [], status: "DRAFT" }, update: {} });
      } else repository = await tx.githubRepository.update({ where: { id: existing!.id }, data: { fetchedAt: this.now(), etag } });
      const day = chinaSnapshotDay(this.now());
      await tx.repositorySnapshot.upsert({ where: { repositoryId_day: { repositoryId: repository!.id, day } }, create: { repositoryId: repository!.id, day, stars: repository!.stars, forks: repository!.forks, fetchedAt: this.now() }, update: { stars: repository!.stars, forks: repository!.forks, fetchedAt: this.now() } });
      const finalResult = item.result === "CREATED" ? "CREATED" : item.result === "UPDATED" && result === "UNCHANGED" ? "UPDATED" : result;
      await tx.collectionTaskItem.update({ where: { id: item.id }, data: { githubId: repository!.githubId, result: finalResult } });
      await this.log(tx, task.id, metadata ? "仓库元数据已保存" : "元数据 ETag 命中 304", { event: metadata ? "METADATA_SAVED" : "METADATA_304", githubId: repository!.githubId.toString(), outcome: result });
      return { repository: repository!, result: finalResult };
    });
  }
  private async processItem(task: CollectionTask, item: CollectionTaskItem, client: GithubClient) {
    const payload = taskPayload.parse(task.payload);
    const existing = item.githubId ? await this.prisma.githubRepository.findUnique({ where: { githubId: item.githubId } }) : await this.prisma.githubRepository.findFirst({ where: { url: { equals: item.url, mode: "insensitive" } } });
    if (payload.kind === "DISCOVER" && existing && !existing.syncEnabled) {
      await this.prisma.$transaction(async tx => { await this.guarded(tx, task); await tx.collectionTaskItem.update({ where: { id: item.id }, data: { status: "SUCCEEDED", result: "SKIPPED_SYNC_DISABLED" } }); await tx.collectionTask.update({ where: { id: task.id }, data: { processedCount: { increment: 1 }, stepAttempts: 0 } }); await this.log(tx, task.id, "仓库已暂停自动发现更新，跳过此项", { event: "SYNC_DISABLED", githubId: existing.githubId.toString() }); });
      await this.release(task); return;
    }
    const result = await client.repository(item.url, existing?.etag ?? undefined, payload.kind === "REFRESH" || item.githubId ? (item.githubId ?? BigInt(payload.kind === "REFRESH" ? payload.githubId : "0")).toString() : undefined);
    const saved = await this.saveMetadata(task, item, result.changed ? result.metadata : null, result.etag);
    const readme = await client.readme(saved.repository.url, saved.repository.readmeEtag ?? undefined);
    await this.prisma.$transaction(async tx => {
      await this.guarded(tx, task);
      const current = await tx.githubRepository.findUniqueOrThrow({ where: { id: saved.repository.id } });
      if (readme.state === "FETCHED") await tx.githubRepository.update({ where: { id: current.id }, data: { readmeText: readme.text, readmeExcerpt: readme.excerpt, readmeSha: readme.sha, readmeEtag: readme.etag, readmeState: "FETCHED", readmeFetchedAt: this.now(), ...(current.readmeSha !== readme.sha && { contentVersion: { increment: 1 } }) } });
      else if (readme.state === "UNCHANGED") await tx.githubRepository.update({ where: { id: current.id }, data: { readmeFetchedAt: this.now() } });
      else await tx.githubRepository.update({ where: { id: current.id }, data: { readmeState: readme.state, readmeText: null, readmeExcerpt: null, readmeSha: null, readmeEtag: null, readmeFetchedAt: this.now(), ...(current.readmeSha && { contentVersion: { increment: 1 } }) } });
      const completed = await tx.collectionTaskItem.updateMany({ where: { id: item.id, status: "QUEUED" }, data: { status: "SUCCEEDED", errorCode: null, result: saved.result } });
      if (completed.count !== 1) throw new CollectorError("ITEM_CONFLICT");
      await tx.collectionTask.update({ where: { id: task.id }, data: { processedCount: { increment: 1 }, stepAttempts: 0, ...(saved.result === "CREATED" ? { createdCount: { increment: 1 } } : saved.result === "UPDATED" ? { updatedCount: { increment: 1 } } : { unchangedCount: { increment: 1 } }) } });
      await this.log(tx, task.id, `仓库步骤完成；README ${readme.state}`, { event: "ITEM_COMPLETED", githubId: saved.repository.githubId.toString(), readmeState: readme.state, outcome: saved.result }, readme.state.startsWith("SKIPPED") ? "WARN" : "INFO");
    });
    await this.release(task);
  }
  async runStep() {
    const task = await this.claim(); if (!task) return { worked: false };
    let item: CollectionTaskItem | null = null;
    try {
      const payload = taskPayload.parse(task.payload); const client = this.client(task);
      item = await this.prisma.collectionTaskItem.findFirst({ where: { taskId: task.id, status: "QUEUED" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      if (item) await this.processItem(task, item, client);
      else if (payload.kind === "DISCOVER" && !task.searchComplete) {
        const result = await client.search(payload, task.page);
        await this.prisma.$transaction(async tx => {
          await this.guarded(tx, task);
          const inserted = await tx.collectionTaskItem.createMany({ data: result.items.map(r => ({ taskId: task.id, githubId: BigInt(r.id), url: r.html_url })), skipDuplicates: true });
          const complete = !result.nextPage || task.page >= payload.maxPages || task.page * payload.perPage >= 1000;
          await tx.collectionTask.update({ where: { id: task.id }, data: { discoveredCount: { increment: inserted.count }, pagesFetched: { increment: 1 }, page: complete ? task.page : result.nextPage!, searchComplete: complete, stepAttempts: 0 } });
          await this.log(tx, task.id, "发现页已保存，等待逐仓库采集", { event: "SEARCH_PAGE", page: task.page, total: result.total_count, returned: result.items.length, newItems: inserted.count, bounded: Boolean(result.nextPage && complete) });
        });
        await this.release(task);
      } else {
        await this.prisma.$transaction(async tx => {
          await this.guarded(tx, task);
          const failedCount = await tx.collectionTaskItem.count({ where: { taskId: task.id, status: "FAILED" } });
          await tx.collectionTask.update({ where: { id: task.id }, data: { status: failedCount ? "FAILED" : "SUCCEEDED", errorCode: failedCount ? "PARTIAL_FAILURE" : null, finishedAt: this.now(), leaseToken: null, leaseUntil: null } });
          await tx.collectorRuntime.updateMany({ where: { id: "github", leaseToken: task.leaseToken }, data: { leaseToken: null, leaseUntil: null } });
          await this.log(tx, task.id, failedCount ? "采集结束，部分仓库失败" : "采集任务完成", { event: "TASK_FINISHED", failedCount });
        });
      }
    } catch (unknownError) {
      const error = safeInternalError(unknownError);
      if (error.code === "LEASE_LOST") return { worked: true, taskId: task.id, code: error.code };
      await this.prisma.$transaction(async tx => {
        await this.guarded(tx, task);
        const attempts = (item?.attempts ?? task.stepAttempts) + 1;
        const retry = error.retryable && attempts < task.maxAttempts;
        const nextAt = retryTime(attempts, this.now(), error.retryAt);
        if (item) await tx.collectionTaskItem.update({ where: { id: item.id }, data: { attempts, errorCode: error.code, ...(!retry && { status: "FAILED" }) } });
        await tx.collectionTask.update({ where: { id: task.id }, data: { status: retry || item ? "QUEUED" : "FAILED", attempts: { increment: 1 }, stepAttempts: item ? 0 : attempts, nextAttemptAt: retry ? nextAt : this.now(), errorCode: error.code, retryScope: error.rateScope ?? null, leaseToken: null, leaseUntil: null, ...(!retry && item && { processedCount: { increment: 1 }, failedCount: { increment: 1 } }), ...(!retry && !item && { finishedAt: this.now() }) } });
        if (["GITHUB_RATE_LIMITED", "GITHUB_FORBIDDEN"].includes(error.code)) await tx.collectorRuntime.updateMany({ where: { id: "github", leaseToken: task.leaseToken }, data: { pausedUntil: error.retryAt ?? nextAt, pauseReason: error.code, pauseScope: error.rateScope ?? "SECONDARY" } });
        await tx.collectorRuntime.updateMany({ where: { id: "github", leaseToken: task.leaseToken }, data: { leaseToken: null, leaseUntil: null } });
        await this.log(tx, task.id, retry ? "失败已安排延迟重试" : "步骤失败，已保留已完成数据", { event: retry ? "RETRY_SCHEDULED" : "STEP_FAILED", code: error.code, attempts, ...(retry && { nextAttemptAt: nextAt.toISOString() }), ...(error.httpStatus && { httpStatus: error.httpStatus }) }, retry ? "WARN" : "ERROR");
      });
    }
    return { worked: true, taskId: task.id };
  }
}
