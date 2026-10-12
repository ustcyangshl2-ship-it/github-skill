import { PrismaClient } from "@prisma/client";

const globalDb = globalThis as unknown as { skillhubDb?: PrismaClient };
export const db = globalDb.skillhubDb ?? new PrismaClient({ log: [] });
if (process.env.NODE_ENV !== "production") globalDb.skillhubDb = db;
