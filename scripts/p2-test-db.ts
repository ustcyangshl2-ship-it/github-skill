import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

export async function testDatabase(reset = true) {
  const source = new URL(process.env.DATABASE_URL!);
  assert.ok(source.hostname === "127.0.0.1" && source.port === "55432" && source.pathname === "/skillhub", "Only the dedicated local PostgreSQL cluster may host P2 fixtures");
  const control = new URL(source); control.pathname = "/postgres";
  const admin = new PrismaClient({ datasources: { db: { url: control.toString() } } });
  try { const exists = await admin.$queryRaw<{ datname: string }[]>`SELECT datname FROM pg_database WHERE datname='skillhub_p2_test'`; if (!exists.length) await admin.$executeRawUnsafe('CREATE DATABASE "skillhub_p2_test"'); } finally { await admin.$disconnect(); }
  const target = new URL(source); target.pathname = "/skillhub_p2_test";
  const migrate = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: target.toString() }, encoding: "utf8" });
  assert.equal(migrate.status, 0, migrate.stderr);
  const prisma = new PrismaClient({ datasources: { db: { url: target.toString() } } });
  if (reset) await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog", "CollectorRuntime", "CollectionTask", "GithubRepository", "User" CASCADE'); // dedicated test database only, never main data
  return { prisma, url: target.toString() };
}
