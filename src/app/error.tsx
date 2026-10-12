"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="shell page-content"><div className="empty mt-12"><h2>数据服务暂不可用</h2><p>请检查数据库连接后重试。当前没有加载替代演示数据。</p><button className="filter-chip" onClick={reset}>重试</button></div></div>; }
