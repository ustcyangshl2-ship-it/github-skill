import "dotenv/config";
import { cp, mkdir, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const output = new URL("../.next/standalone/", import.meta.url);
try { await access(new URL("server.js", output)); }
catch { throw new Error("Build SkillHub first: npm run build"); }
await mkdir(new URL(".next/", output), { recursive: true });
await cp(new URL("../.next/static/", import.meta.url), new URL(".next/static/", output), { recursive: true });
const child = spawn(process.execPath, [fileURLToPath(new URL("server.js", output))], { stdio: "inherit", env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: "3300" } });
const worker = process.env.SKILLHUB_RUN_WORKER === "false" ? undefined : spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("collector-worker.ts", import.meta.url))], { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { child.kill(signal); worker?.kill(signal); });
worker?.on("exit", code => { if (code) console.error("Collector process stopped unexpectedly; tasks remain durable. Restart collector:worker."); });
child.on("exit", code => { if (worker && worker.exitCode === null) { worker.kill("SIGTERM"); worker.once("exit", () => process.exit(code ?? 1)); } else process.exit(code ?? 1); });
