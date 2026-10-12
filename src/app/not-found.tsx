import Link from "next/link";
export default function NotFound() { return <div className="shell page-content"><div className="empty mt-12"><h2>这里还没有公开内容</h2><p>项目可能尚未发布，或地址有误。</p><Link href="/skills">返回 Skill 目录 →</Link></div></div>; }
