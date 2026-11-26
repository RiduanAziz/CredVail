#!/usr/bin/env node
/**
 * CREDVAIL PostgreSQL Super Admin Bootstrap CLI
 *
 * Creates or promotes a platform user to SUPER_ADMIN in PostgreSQL using Argon2id hashing.
 * Usage:
 *   node scripts/seed-super-admin.mjs --email admin@credvail.io --password "<strong-password>" --name "Platform Admin"
 */

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password.ts";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--email" && argv[i + 1]) args.email = argv[++i];
    else if (token === "--password" && argv[i + 1]) args.password = argv[++i];
    else if (token === "--name" && argv[i + 1]) args.name = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = (args.email || process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = args.password || process.env.SUPER_ADMIN_PASSWORD || "";
  const fullName = (args.name || process.env.SUPER_ADMIN_NAME || "CREDVAIL Super Admin").trim();

  if (!email || !email.includes("@")) {
    console.error("Error: Valid --email (or SUPER_ADMIN_EMAIL) is required.");
    process.exit(1);
  }
  if (!password || password.length < 12) {
    console.error("Error: Password (or SUPER_ADMIN_PASSWORD) must be at least 12 characters.");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL must be configured to seed PostgreSQL.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await hashPassword(password);
    const now = new Date();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          platformRole: "SUPER_ADMIN",
          passwordHash,
          fullName,
          emailVerifiedAt: existing.emailVerifiedAt || now,
        },
      });
      console.log(`Updated existing account '${email}' to SUPER_ADMIN.`);
    } else {
      await prisma.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          platformRole: "SUPER_ADMIN",
          emailVerifiedAt: now,
        },
      });
      console.log(`Created SUPER_ADMIN account '${email}'.`);
    }
  } catch (err) {
    console.error(
      "Failed to seed SUPER_ADMIN in PostgreSQL:",
      err instanceof Error ? err.message.replace(/postgresql:\/\/[^@\s]+@/gi, "postgresql://***:***@") : "Unknown DB error"
    );
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
