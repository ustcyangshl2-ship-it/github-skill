import { Code2, Files, FlaskConical, GraduationCap, Sparkles, Workflow, type LucideIcon } from "lucide-react";
const icons: Record<string, LucideIcon> = { Code2, Files, FlaskConical, GraduationCap, Sparkles, Workflow };
export function CategoryIcon({ name, size = 22 }: { name: string; size?: number }) { const Icon = icons[name] ?? Sparkles; return <Icon size={size} />; }
