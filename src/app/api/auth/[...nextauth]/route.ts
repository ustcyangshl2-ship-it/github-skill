import NextAuth from "next-auth";
import { authConfigured, authOptions } from "@/lib/auth";
import { failure } from "@/lib/api";
const handler = NextAuth(authOptions);
export async function GET(...args: Parameters<typeof handler>) {
  if (!authConfigured()) return failure("AUTH_NOT_CONFIGURED", "GitHub 登录尚未配置", 503);
  return handler(...args);
}
export async function POST(...args: Parameters<typeof handler>) {
  if (!authConfigured()) return failure("AUTH_NOT_CONFIGURED", "GitHub 登录尚未配置", 503);
  return handler(...args);
}
