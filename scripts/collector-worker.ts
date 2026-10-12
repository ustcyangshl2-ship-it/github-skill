import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { CollectorWorker } from "../src/server/collector/worker";
const prisma = new PrismaClient();
const worker = new CollectorWorker(prisma, { token: process.env.GITHUB_TOKEN });
const once = process.argv.includes("--once");
let stop = false;
process.on("SIGINT", () => { stop = true; }); process.on("SIGTERM", () => { stop = true; });
try {
  console.log(`SkillHub collector started (${process.env.GITHUB_TOKEN ? "authenticated GitHub" : "public GitHub"}, ${once ? "drain due work" : "continuous"}).`);
  let steps = 0;
  while (!stop) {
    try {
      const result = await worker.runStep();
      if (result.worked) { console.log(`Collector step: ${result.taskId}`); steps++; }
      if (once && (!result.worked || steps >= 200)) break;
      if (!result.worked) await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) { console.error("Collector dependency error", error instanceof Error ? error.name : "UnknownError"); if (once) { process.exitCode = 1; break; } await new Promise(resolve => setTimeout(resolve, 5000)); }
  }
  const queued = await prisma.collectionTask.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } });
  console.log(`Collector stopped. Pending tasks: ${queued}; deferred/rate-limited work remains durable.`);
} finally { await prisma.$disconnect(); }
