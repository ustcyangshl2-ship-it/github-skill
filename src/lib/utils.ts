import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function number(value: number) { return new Intl.NumberFormat("zh-CN").format(value); }
export function date(value: Date) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
export const typeNames = { UNKNOWN: "待分类", SKILL: "Skill", TOOL: "工具", FRAMEWORK: "框架" } as const;
export const difficultyNames = { BEGINNER: "入门", INTERMEDIATE: "进阶", ADVANCED: "高级" } as const;
