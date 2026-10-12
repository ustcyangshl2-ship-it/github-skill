import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const url = new URL(process.env.DATABASE_URL!);
if (url.hostname !== "127.0.0.1" || url.pathname !== "/skillhub" || url.port !== "55432") throw new Error("This bootstrap script is only for the dedicated loopback SkillHub database.");
url.pathname = "/postgres";
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
try {
  const existing = await prisma.$queryRaw<{ datname: string }[]>`SELECT datname FROM pg_database WHERE datname = 'skillhub'`;
  if (!existing.length) await prisma.$executeRawUnsafe('CREATE DATABASE "skillhub"'); // fixed identifier, no user input
  console.log("Dedicated local database ready.");
} finally { await prisma.$disconnect(); }
