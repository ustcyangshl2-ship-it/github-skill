import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { currentUser } from "./auth";
import { db } from "./db";
import { AdminError, ensureManager } from "../server/collector/service";

export async function manager() {
  const user = await currentUser();
  if (!user) throw new AdminError("UNAUTHENTICATED", 401, "请先登录");
  return ensureManager(db, user.id);
}
export async function managerPage() {
  try { return await manager(); }
  catch (error) { if (error instanceof AdminError) redirect(error.status === 401 ? "/login" : "/account"); throw error; }
}
export function requireOrigin(request: Request) {
  const raw = request.headers.get("origin");
  if (!raw) throw new AdminError("INVALID_ORIGIN", 403, "写操作必须来自本站");
  let origin: URL; let configured: URL;
  try { origin = new URL(raw); configured = new URL(process.env.NEXTAUTH_URL!); } catch { throw new AdminError("INVALID_ORIGIN", 403, "请求来源无效"); }
  const target = new URL(request.url);
  const loopback = (u: URL) => ["127.0.0.1", "localhost"].includes(u.hostname);
  const localAlias = loopback(configured) && loopback(origin) && loopback(target) && configured.port === origin.port && target.port === origin.port && origin.protocol === "http:";
  if (origin.origin !== configured.origin && !localAlias) throw new AdminError("INVALID_ORIGIN", 403, "请求来源不匹配");
}
export async function jsonBody(request: Request) {
  requireOrigin(request);
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AdminError("INVALID_CONTENT_TYPE", 415, "请使用 JSON 请求");
  if (Number(request.headers.get("content-length")) > 8192) throw new AdminError("BODY_TOO_LARGE", 413, "请求过大");
  const reader = request.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  if (!reader) throw new AdminError("INVALID_JSON", 400, "请求内容为空");
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 8192) throw new AdminError("BODY_TOO_LARGE", 413, "请求过大"); chunks.push(part.value); }
  } finally { await reader.cancel().catch(() => undefined); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; } catch { throw new AdminError("INVALID_JSON", 400, "JSON 无效"); }
}
export function idempotencyKey(request: Request) {
  const key = request.headers.get("idempotency-key") ?? undefined;
  if (key && !/^[a-zA-Z0-9_.-]{8,100}$/.test(key)) throw new AdminError("INVALID_IDEMPOTENCY_KEY", 400, "幂等键格式无效");
  return key;
}
export function adminJson(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}
