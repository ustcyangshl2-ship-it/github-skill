import Link from "next/link";
export function AdminNav() { return <nav className="filter-bar admin-nav" aria-label="管理导航"><Link className="filter-chip" href="/admin">数据仪表盘</Link><Link className="filter-chip" href="/admin/repositories">仓库管理与导入</Link><Link className="filter-chip" href="/admin/collection-tasks">采集任务与日志</Link></nav>; }
