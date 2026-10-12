import { KeyRound } from "lucide-react";
import Link from "next/link";
import { authConfigured } from "@/lib/auth";
import { LoginButton } from "@/components/login-button";
export default function Login() {
  const configured = authConfigured();
  return <div className="shell page-content"><section className="panel auth-panel"><KeyRound size={35} /><h1>你的 AI 工具箱</h1><p>登录后查看自己的收藏和会员状态。</p>{configured ? <LoginButton /> : <div className="notice">GitHub 登录尚未配置。需要管理员配置 OAuth Client ID 与 Secret 后才能使用，当前不提供模拟登录。</div>}<Link href="/skills" className="back-link">先逛逛公开目录 →</Link></section></div>;
}
