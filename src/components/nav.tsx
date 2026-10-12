"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Menu, X, Command } from "lucide-react";
import { cn } from "@/lib/utils";
const links = [["/skills", "Skill 目录"], ["/rankings", "排行榜"], ["/collections", "精选合集"], ["/tutorials", "教程中心"]];
export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return <header className="site-header"><div className="shell nav-inner">
    <Link className="brand" href="/" onClick={() => setOpen(false)} aria-label="SkillHub 首页"><span className="brand-mark"><Command size={21} /></span>SkillHub<span className="brand-dot">.</span></Link>
    <nav className="desktop-nav" aria-label="主导航">{links.map(([href, label]) => <Link key={href} href={href} className={cn(path.startsWith(href) && "active")}>{label}</Link>)}</nav>
    <Link className="account-link" href="/account">我的工具箱 <ArrowUpRight size={15} /></Link>
    <button className="mobile-toggle" aria-label={open ? "关闭导航" : "打开导航"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
  </div>{open && <nav className="mobile-nav" aria-label="移动导航">{links.map(([href, label]) => <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>)}<Link href="/account" onClick={() => setOpen(false)}>我的工具箱</Link></nav>}</header>;
}
