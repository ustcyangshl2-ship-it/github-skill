import { repositorySchema, searchSchema, readmeSchema, searchQuery, type TaskPayload } from "./contracts";
import { CollectorError } from "./errors";
import { parseGithubUrl } from "../../lib/validation";

export type GithubHooks = { beforeRequest?: () => Promise<void>; observe?: (headers: Headers) => Promise<void> };
export function githubRetryAt(headers: Headers, now = new Date()): Date | undefined {
  const after = headers.get("retry-after");
  const afterMs = after && /^\d+$/.test(after) ? now.getTime() + Number(after) * 1000 : after ? Date.parse(after) : NaN;
  const resetMs = headers.get("x-ratelimit-remaining") === "0" ? Number(headers.get("x-ratelimit-reset")) * 1000 + 1000 : NaN;
  const candidates = [afterMs, resetMs].filter(n => Number.isFinite(n) && n > now.getTime() && !Number.isNaN(new Date(n).getTime()));
  return candidates.length ? new Date(Math.max(...candidates)) : undefined;
}
export function nextSearchPage(link: string | null, query: string, perPage: number, current: number): number | null {
  if (!link) return null;
  const match = link.match(/<([^>]+)>\s*;\s*rel="next"/);
  if (!match) return null;
  const u = new URL(match[1]);
  const page = Number(u.searchParams.get("page"));
  if (u.origin !== "https://api.github.com" || u.username || u.password || u.hash || u.pathname !== "/search/repositories" || u.searchParams.get("q") !== query || Number(u.searchParams.get("per_page")) !== perPage || u.searchParams.get("sort") !== "stars" || u.searchParams.get("order") !== "desc" || page !== current + 1 || [...u.searchParams.keys()].some(k => !["q", "per_page", "sort", "order", "page"].includes(k))) throw new CollectorError("INVALID_PAGINATION_LINK");
  return page;
}
async function boundedJson(response: Response, maxBytes: number) {
  if (Number(response.headers.get("content-length")) > maxBytes) { await response.body?.cancel(); throw new CollectorError("RESPONSE_TOO_LARGE"); }
  if (!response.body) throw new CollectorError("EMPTY_RESPONSE", true);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > maxBytes) throw new CollectorError("RESPONSE_TOO_LARGE"); chunks.push(part.value); }
  } finally { await reader.cancel().catch(() => undefined); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; } catch { throw new CollectorError("INVALID_GITHUB_JSON", true); }
}
export class GithubClient {
  constructor(private options: { token?: string; fetch?: typeof fetch; hooks?: GithubHooks; now?: () => Date } = {}) {}
  private async request(path: string, etag?: string) {
    const u = new URL(path, "https://api.github.com");
    if (u.origin !== "https://api.github.com" || u.username || u.password || !(/^\/repos\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+(?:\/readme)?$/.test(u.pathname) || /^\/repositories\/\d+$/.test(u.pathname) || u.pathname === "/search/repositories")) throw new CollectorError("INVALID_GITHUB_TARGET");
    await this.options.hooks?.beforeRequest?.();
    let response: Response;
    try { response = await (this.options.fetch ?? fetch)(u, { redirect: "manual", signal: AbortSignal.timeout(15000), headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "SkillHub-Collector/0.2.0", ...(this.options.token && { Authorization: `Bearer ${this.options.token}` }), ...(etag && { "If-None-Match": etag }) } }); }
    catch { throw new CollectorError("GITHUB_NETWORK_ERROR", true); }
    await this.options.hooks?.observe?.(response.headers);
    if (response.status === 304) return { response, data: null };
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new CollectorError("GITHUB_REDIRECT_REJECTED", false, undefined, response.status); }
    if (!response.ok) {
      const retryAt = githubRetryAt(response.headers, this.options.now?.() ?? new Date());
      await response.body?.cancel();
      if (response.status === 429 || (response.status === 403 && retryAt)) throw new CollectorError("GITHUB_RATE_LIMITED", true, retryAt ?? new Date((this.options.now?.() ?? new Date()).getTime() + 60000), response.status, !response.headers.has("retry-after") && response.headers.get("x-ratelimit-remaining") === "0" ? "PRIMARY" : "SECONDARY");
      if (response.status === 403) throw new CollectorError("GITHUB_FORBIDDEN", true, new Date((this.options.now?.() ?? new Date()).getTime() + 60000), 403, "SECONDARY");
      if (response.status >= 500 || response.status === 408) throw new CollectorError("GITHUB_UNAVAILABLE", true, retryAt, response.status);
      throw new CollectorError(response.status === 404 ? "GITHUB_NOT_FOUND" : response.status === 401 ? "GITHUB_AUTH_FAILED" : "GITHUB_REQUEST_REJECTED", false, undefined, response.status);
    }
    return { response, data: await boundedJson(response, 2 * 1024 * 1024) };
  }
  async repository(url: string, etag?: string, githubId?: string) {
    if (githubId && !/^\d+$/.test(githubId)) throw new CollectorError("INVALID_REPOSITORY_ID");
    const { owner, repo } = parseGithubUrl(url);
    const path = githubId ? `/repositories/${githubId}` : `/repos/${owner}/${repo}`;
    const { response, data } = await this.request(path, etag);
    if (response.status === 304) return { changed: false as const, etag: response.headers.get("etag") ?? etag ?? null };
    const parsed = repositorySchema.safeParse(data);
    if (!parsed.success) throw new CollectorError("INVALID_REPOSITORY_METADATA");
    if (githubId && parsed.data.id.toString() !== githubId) throw new CollectorError("REPOSITORY_ID_MISMATCH");
    return { changed: true as const, metadata: parsed.data, etag: response.headers.get("etag") };
  }
  async readme(url: string, etag?: string) {
    const { owner, repo } = parseGithubUrl(url);
    try {
      const { response, data } = await this.request(`/repos/${owner}/${repo}/readme`, etag);
      if (response.status === 304) return { state: "UNCHANGED" as const, etag: response.headers.get("etag") ?? etag ?? null };
      const parsed = readmeSchema.safeParse(data);
      if (!parsed.success) throw new CollectorError("INVALID_README_METADATA");
      if (parsed.data.size > 256 * 1024) return { state: "SKIPPED_TOO_LARGE" as const };
      const compact = parsed.data.content.replace(/\s/g, "");
      if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 !== 0) throw new CollectorError("INVALID_README_CONTENT");
      const bytes = Buffer.from(compact, "base64");
      if (bytes.length > 256 * 1024) return { state: "SKIPPED_TOO_LARGE" as const };
      if (bytes.length !== parsed.data.size) throw new CollectorError("README_SIZE_MISMATCH");
      let text: string; try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return { state: "SKIPPED_NON_UTF8" as const }; }
      return { state: "FETCHED" as const, text, sha: parsed.data.sha, etag: response.headers.get("etag"), excerpt: text.replace(/```[\s\S]*?```/g, " ").replace(/<[^>]*>/g, " ").replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim().slice(0, 1800) };
    } catch (error) { if (error instanceof CollectorError && error.code === "GITHUB_NOT_FOUND") return { state: "MISSING" as const }; if (error instanceof CollectorError && error.code === "RESPONSE_TOO_LARGE") return { state: "SKIPPED_TOO_LARGE" as const }; throw error; }
  }
  async search(payload: Extract<TaskPayload, { kind: "DISCOVER" }>, page: number) {
    const query = searchQuery(payload);
    const params = new URLSearchParams({ q: query, sort: "stars", order: "desc", per_page: String(payload.perPage), page: String(page) });
    const { response, data } = await this.request(`/search/repositories?${params}`);
    const parsed = searchSchema.safeParse(data);
    if (!parsed.success) throw new CollectorError("INVALID_SEARCH_METADATA");
    if (parsed.data.incomplete_results) throw new CollectorError("SEARCH_RESULTS_INCOMPLETE", true);
    return { ...parsed.data, nextPage: nextSearchPage(response.headers.get("link"), query, payload.perPage, page) };
  }
}
