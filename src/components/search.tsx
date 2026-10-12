import { Search, ArrowRight } from "lucide-react";
export function SearchBox({ value = "", large = false }: { value?: string; large?: boolean }) {
  return <form action="/skills" method="get" className={`search-box ${large ? "large" : ""}`} role="search"><Search size={21} aria-hidden="true" /><input name="q" defaultValue={value} maxLength={100} placeholder="搜索 Skill、工具，或你想完成的事…" aria-label="搜索 Skill 和工具" /><button type="submit">搜索 <ArrowRight size={17} /></button></form>;
}
