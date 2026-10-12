import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/nav";
import "./globals.css";
export const metadata: Metadata = { title: { default: "SkillHub · 找到值得掌握的 AI 能力", template: "%s · SkillHub" }, description: "面向中文用户的 AI Skill 与开源工具精选导航。阅读中文解读，核对源项目与许可证，探索你的 AI 工具箱。" };
export const dynamic = "force-dynamic";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body><Nav /><main>{children}</main><footer className="site-footer"><div className="shell footer-inner"><div><strong>SkillHub.</strong> &nbsp;发现能力，保持判断。<br />条目保留原始来源与许可证；Star 为快照，精选不代表实测。</div><div className="footer-links"><Link href="/skills">探索目录</Link><Link href="/tutorials">学习指南</Link><Link href="/admin">管理后台</Link></div></div></footer></body></html>;
}
