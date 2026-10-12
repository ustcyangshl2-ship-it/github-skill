import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const args = process.argv.slice(2); const id = args[args.indexOf("--user-id") + 1]; const role = args[args.indexOf("--role") + 1];
if (!args.includes("--user-id") || !args.includes("--role") || !id || !["EDITOR", "ADMIN"].includes(role)) throw new Error("Usage: npm run admin:grant -- --user-id <existing-user-id> --role EDITOR|ADMIN");
try {
  await prisma.$transaction(async tx => {
    const user = await tx.user.findUniqueOrThrow({ where: { id } });
    await tx.user.update({ where: { id }, data: { role: role as "EDITOR" | "ADMIN" } });
    await tx.auditLog.create({ data: { action: "OPERATOR_ROLE_GRANT", entityType: "User", entityId: id, changes: { before: user.role, after: role, source: "explicit-local-cli" } } });
  });
  console.log(`Granted ${role} to existing user ${id}; audit recorded. No default administrator was created.`);
} finally { await prisma.$disconnect(); }
