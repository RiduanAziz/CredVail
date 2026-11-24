#!/usr/bin/env node
/**
 * CREDVAIL Issuer Key Migration Utility
 * 
 * Safely migrates existing encrypted issuer private keys from legacy session-derived
 * encryption (SESSION_SECRET / SHA-256) to independent KMS master key (KMS_MASTER_KEY / HKDF-SHA-256).
 * 
 * Safety Requirements Enforced:
 * 1. Safe dry-run mode by default. Pass `--apply` to commit changes.
 * 2. Requires `LEGACY_SESSION_SECRET` environment variable for legacy key decryption.
 * 3. Requires `KMS_MASTER_KEY` (canonical 32-byte Base64) for new key derivation.
 * 4. Never exposes private keys or raw secret material in console or logs.
 * 5. Idempotent: Skips records already encrypted with the new KMS master key.
 * 6. Verifies decryption of new ciphertext before committing any database record.
 * 7. Transactional: All updates executed atomically via prisma.$transaction.
 * 
 * Usage:
 *   # Dry-run inspection
 *   LEGACY_SESSION_SECRET="..." KMS_MASTER_KEY="..." node scripts/migrate-issuer-keys.mjs
 * 
 *   # Live migration
 *   LEGACY_SESSION_SECRET="..." KMS_MASTER_KEY="..." node scripts/migrate-issuer-keys.mjs --apply
 */

import { PrismaClient } from "@prisma/client";
import {
  deriveLegacyKey,
  resolveKmsKey,
  evaluateKeyMigration,
} from "../src/lib/crypto/key-migration.ts";

const prisma = new PrismaClient();

async function main() {
  const isApply = process.argv.includes("--apply");
  console.log("===============================================================================");
  console.log(" CREDVAIL — Issuer Private Key KMS Migration Utility");
  console.log(` Mode: ${isApply ? "LIVE EXECUTION (--apply)" : "DRY-RUN (Safe audit, no changes made)"}`);
  console.log("===============================================================================");

  const legacySecret = process.env.LEGACY_SESSION_SECRET;
  const newKmsKey = process.env.KMS_MASTER_KEY;

  if (!newKmsKey) {
    console.error("FATAL: KMS_MASTER_KEY environment variable is missing.");
    console.error("Please supply a valid canonical 32-byte Base64 key.");
    process.exit(1);
  }

  let newAesKey;
  try {
    newAesKey = resolveKmsKey(newKmsKey);
    console.log("[OK] KMS_MASTER_KEY validated successfully (32 bytes Base64).");
  } catch (err) {
    console.error(`FATAL: Invalid KMS_MASTER_KEY: ${err.message}`);
    process.exit(1);
  }

  let legacyAesKey = null;
  if (legacySecret) {
    try {
      legacyAesKey = deriveLegacyKey(legacySecret);
      console.log("[OK] LEGACY_SESSION_SECRET provided and derived for legacy decryption.");
    } catch (err) {
      console.error(`FATAL: Invalid LEGACY_SESSION_SECRET: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.log("[WARN] LEGACY_SESSION_SECRET not provided. Can only audit records already on new key.");
  }

  let records = [];
  try {
    records = await prisma.issuerKey.findMany({
      select: {
        id: true,
        tenantId: true,
        keyIdentifier: true,
        encryptedPrivateKey: true,
      },
    });
    console.log(`Found ${records.length} IssuerKey record(s) in database.`);
  } catch (err) {
    console.error(`[DIAGNOSTIC - DATABASE UNAVAILABLE]: Database connection failed: ${err.message}`);
    console.error("Status: BLOCKED — Local environment lacks active PostgreSQL daemon.");
    console.error("Record existence and migration compatibility against live DB are unverified.");
    process.exit(1);
  }

  if (records.length === 0) {
    console.log("[INFO] Database contains 0 IssuerKey records. No migration needed.");
    process.exit(0);
  }

  let countAlreadyMigrated = 0;
  let countNeedMigration = 0;
  let countFailed = 0;
  const updatesToApply = [];

  for (const record of records) {
    if (!record.encryptedPrivateKey) {
      console.log(`[SKIP] Record ID ${record.id} has no encryptedPrivateKey.`);
      continue;
    }

    const result = evaluateKeyMigration(record.encryptedPrivateKey, legacyAesKey, newAesKey);

    if (result.status === "ALREADY_MIGRATED") {
      countAlreadyMigrated++;
    } else if (result.status === "READY_TO_UPDATE" && result.newCiphertext) {
      countNeedMigration++;
      updatesToApply.push({
        id: record.id,
        newEncrypted: result.newCiphertext,
      });
    } else {
      countFailed++;
      console.error(`[ERROR] Record ID ${record.id}: ${result.status} (${result.error || "Unknown error"})`);
    }
  }

  let countSuccessfullyMigrated = 0;
  if (isApply && updatesToApply.length > 0) {
    if (countFailed > 0) {
      console.error("FATAL: Aborting transaction due to one or more failed records. No changes committed.");
      process.exit(2);
    }

    console.log(`Applying ${updatesToApply.length} update(s) atomically via prisma.$transaction...`);
    await prisma.$transaction(
      updatesToApply.map((u) =>
        prisma.issuerKey.update({
          where: { id: u.id },
          data: { encryptedPrivateKey: u.newEncrypted },
        })
      )
    );
    countSuccessfullyMigrated = updatesToApply.length;
    console.log("[OK] Transaction committed successfully.");
  }

  console.log("-------------------------------------------------------------------------------");
  console.log(" Migration Summary:");
  console.log(` - Total records evaluated:    ${records.length}`);
  console.log(` - Already on new KMS key:     ${countAlreadyMigrated}`);
  console.log(` - Pending migration:          ${countNeedMigration}`);
  console.log(` - Decryption/verify failures: ${countFailed}`);
  if (isApply) {
    console.log(` - Successfully updated in DB: ${countSuccessfullyMigrated}`);
  } else {
    console.log(" - Dry-run complete. Re-run with --apply to commit changes to database.");
  }
  console.log("-------------------------------------------------------------------------------");

  if (countFailed > 0) {
    process.exit(2);
  }
}

main()
  .catch((err) => {
    console.error("Unexpected error:", err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
