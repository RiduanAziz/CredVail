#!/usr/bin/env node
/**
 * CREDVAIL Issuer Key Migration Utility
 *
 * Safely migrates existing encrypted issuer private keys from legacy session-derived
 * encryption (SESSION_SECRET / SHA-256) to independent KMS master key (KMS_MASTER_KEY / HKDF-SHA-256).
 *
 * Safety Requirements Enforced:
 * 1. Safe dry-run mode by default. Pass `--apply` to commit changes.
 * 2. Strict preflight validation BEFORE Prisma initialization (prevents silent `.env` secret override).
 * 3. Requires `KMS_MASTER_KEY` (canonical 32-byte Base64) and valid PostgreSQL `DATABASE_URL`.
 * 4. Requires `LEGACY_SESSION_SECRET` unless explicitly running read-only KMS verification (`--audit-kms-only`).
 * 5. Never exposes private keys, database passwords, or raw secret material in console or logs.
 * 6. Idempotent: Skips records already encrypted with the new KMS master key.
 * 7. Verifies decryption of new ciphertext before committing any database record.
 * 8. Transactional & Race-Safe: Performs read-evaluate-update with optimistic CAS inside a single
 *    Serializable PostgreSQL transaction via `prisma.$transaction`.
 *
 * Usage:
 *   # Dry-run inspection (default safe mode)
 *   DATABASE_URL="..." LEGACY_SESSION_SECRET="..." KMS_MASTER_KEY="..." node scripts/migrate-issuer-keys.mjs
 *
 *   # Live atomic migration
 *   DATABASE_URL="..." LEGACY_SESSION_SECRET="..." KMS_MASTER_KEY="..." node scripts/migrate-issuer-keys.mjs --apply
 *
 *   # Post-migration read-only audit without legacy secret
 *   DATABASE_URL="..." KMS_MASTER_KEY="..." node scripts/migrate-issuer-keys.mjs --audit-kms-only
 */

import {
  deriveLegacyKey,
  resolveKmsKey,
  evaluateKeyMigration,
  parseSafeDatabaseTarget,
  sanitizeErrorText,
} from "../src/lib/crypto/key-migration.ts";

function printHelp() {
  console.log(`
CREDVAIL Issuer Private Key KMS Migration Utility

Modes:
  (default)          Read-only dry-run inspecting legacy and KMS-encrypted records.
  --apply            Atomically re-encrypt eligible legacy records inside a Serializable DB transaction.
  --audit-kms-only   Read-only check verifying records already decrypt under KMS_MASTER_KEY (no legacy secret needed).
  --help             Show this help message.

Required Environment Variables:
  DATABASE_URL            PostgreSQL connection string (credentials are never logged).
  KMS_MASTER_KEY          Canonical 32-byte Base64 master key (44 chars ending with '=').
  LEGACY_SESSION_SECRET   Legacy session secret (required unless --audit-kms-only is specified).
`);
}

function classifyAndSummarize(records, legacyAesKey, newAesKey) {
  let countAlreadyMigrated = 0;
  let countNeedMigration = 0;
  let countSkipped = 0;
  let countFailed = 0;
  const updatesToApply = [];
  const errors = [];

  for (const record of records) {
    if (!record.encryptedPrivateKey) {
      countSkipped++;
      console.log(`[SKIP] Record ID ${record.id} (epoch ${record.keyEpoch}) has no encryptedPrivateKey.`);
      continue;
    }

    const result = evaluateKeyMigration(record.encryptedPrivateKey, legacyAesKey, newAesKey);

    if (result.status === "ALREADY_MIGRATED") {
      countAlreadyMigrated++;
    } else if (result.status === "READY_TO_UPDATE" && result.newCiphertext) {
      countNeedMigration++;
      updatesToApply.push({
        id: record.id,
        keyEpoch: record.keyEpoch,
        oldEncrypted: record.encryptedPrivateKey,
        newEncrypted: result.newCiphertext,
      });
    } else {
      countFailed++;
      const errLine = `[ERROR] Record ID ${record.id} (epoch ${record.keyEpoch}): ${result.status} (${result.error || "Unknown error"})`;
      errors.push(errLine);
      console.error(errLine);
    }
  }

  return {
    countAlreadyMigrated,
    countNeedMigration,
    countSkipped,
    countFailed,
    updatesToApply,
    errors,
  };
}

function printSummary(total, stats, isApply, isAuditOnly, countSuccessfullyMigrated) {
  console.log("-------------------------------------------------------------------------------");
  console.log(" Migration Summary:");
  console.log(` - Total records evaluated:    ${total}`);
  console.log(` - Already on new KMS key:     ${stats.countAlreadyMigrated}`);
  console.log(` - Pending/eligible migration: ${stats.countNeedMigration}`);
  console.log(` - Skipped (null payload):     ${stats.countSkipped}`);
  console.log(` - Decryption/verify failures: ${stats.countFailed}`);
  if (isApply) {
    console.log(` - Successfully updated in DB: ${countSuccessfullyMigrated}`);
  } else if (isAuditOnly) {
    console.log(" - KMS-only read-only audit complete. No database writes performed.");
  } else {
    console.log(" - Dry-run complete. Re-run with --apply to commit changes to database.");
  }
  console.log("-------------------------------------------------------------------------------");
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) {
    printHelp();
    return;
  }

  const isApply = args.has("--apply");
  const isDryRunFlag = args.has("--dry-run");
  const isAuditOnly = args.has("--audit-kms-only");

  if (isApply && isDryRunFlag) {
    console.error("FATAL: Cannot combine --apply and --dry-run flags.");
    process.exitCode = 1;
    return;
  }

  if (isApply && isAuditOnly) {
    console.error("FATAL: Cannot combine --apply and --audit-kms-only flags.");
    process.exitCode = 1;
    return;
  }

  const modeLabel = isApply
    ? "LIVE EXECUTION (--apply)"
    : isAuditOnly
      ? "READ-ONLY KMS AUDIT (--audit-kms-only)"
      : "DRY-RUN (Safe audit, no changes made)";

  console.log("===============================================================================");
  console.log(" CREDVAIL — Issuer Private Key KMS Migration Utility");
  console.log(` Mode: ${modeLabel}`);
  console.log("===============================================================================");

  // CRITICAL: Snapshot and validate environment BEFORE instantiating PrismaClient
  // so Prisma's internal `.env` loader cannot silently inject fallback secrets.
  let rawDbUrl = process.env.DATABASE_URL;
  if (rawDbUrl && typeof rawDbUrl === "string") {
    rawDbUrl = rawDbUrl.trim();
    if (
      (rawDbUrl.startsWith('"') && rawDbUrl.endsWith('"')) ||
      (rawDbUrl.startsWith("'") && rawDbUrl.endsWith("'"))
    ) {
      rawDbUrl = rawDbUrl.slice(1, -1).trim();
    }
  }
  const legacySecret = process.env.LEGACY_SESSION_SECRET;
  const newKmsKey = process.env.KMS_MASTER_KEY;

  let dbTarget;
  try {
    dbTarget = parseSafeDatabaseTarget(rawDbUrl);
    console.log(
      `[OK] Target PostgreSQL database validated: ${dbTarget.protocol}://${dbTarget.hostname}:${dbTarget.port}/${dbTarget.database}?schema=${dbTarget.schema}`
    );
  } catch (err) {
    console.error(`FATAL: Invalid DATABASE_URL: ${sanitizeErrorText(err)}`);
    process.exitCode = 1;
    return;
  }

  if (!newKmsKey || newKmsKey.trim() === "") {
    console.error("FATAL: KMS_MASTER_KEY environment variable is missing.");
    console.error("Please supply a valid canonical 32-byte Base64 key.");
    process.exitCode = 1;
    return;
  }

  let newAesKey;
  try {
    newAesKey = resolveKmsKey(newKmsKey);
    console.log("[OK] KMS_MASTER_KEY validated successfully (32 bytes Base64, HKDF-SHA-256).");
  } catch (err) {
    console.error(`FATAL: Invalid KMS_MASTER_KEY: ${sanitizeErrorText(err)}`);
    process.exitCode = 1;
    return;
  }

  let legacyAesKey = null;
  if (isAuditOnly) {
    if (legacySecret !== undefined && legacySecret.trim() !== "") {
      try {
        legacyAesKey = deriveLegacyKey(legacySecret);
        console.log("[OK] LEGACY_SESSION_SECRET provided for read-only classification.");
      } catch (err) {
        console.error(`FATAL: Invalid LEGACY_SESSION_SECRET: ${sanitizeErrorText(err)}`);
        process.exitCode = 1;
        return;
      }
    } else {
      console.log("[INFO] Running read-only KMS audit without LEGACY_SESSION_SECRET.");
    }
  } else {
    if (legacySecret === undefined) {
      console.error("FATAL: LEGACY_SESSION_SECRET environment variable is missing.");
      console.error("Provide LEGACY_SESSION_SECRET to decrypt legacy issuer keys (or use --audit-kms-only for read-only audit).");
      process.exitCode = 1;
      return;
    }
    try {
      legacyAesKey = deriveLegacyKey(legacySecret);
      console.log("[OK] LEGACY_SESSION_SECRET validated and derived (SHA-256) for legacy decryption.");
    } catch (err) {
      console.error(`FATAL: Invalid LEGACY_SESSION_SECRET: ${sanitizeErrorText(err)}`);
      process.exitCode = 1;
      return;
    }
  }

  // Dynamic import AFTER preflight checks so `@prisma/client` module evaluation
  // cannot silently populate process.env from local `.env` before validation.
  const { PrismaClient } = await import("@prisma/client");
  // Instantiate PrismaClient explicitly bound to validated DATABASE_URL
  const prisma = new PrismaClient({
    datasources: { db: { url: rawDbUrl } },
  });

  try {
    if (!isApply) {
      let records;
      try {
        records = await prisma.issuerKey.findMany({
          orderBy: [{ tenantId: "asc" }, { keyEpoch: "asc" }],
          select: {
            id: true,
            tenantId: true,
            keyEpoch: true,
            keyIdentifier: true,
            encryptedPrivateKey: true,
          },
        });
        console.log(`Found ${records.length} IssuerKey record(s) in database.`);
      } catch (err) {
        console.error(`[DIAGNOSTIC - DATABASE UNAVAILABLE]: Database query failed: ${sanitizeErrorText(err)}`);
        process.exitCode = 1;
        return;
      }

      if (records.length === 0) {
        console.log("[INFO] Database contains 0 IssuerKey records. No migration needed.");
        return;
      }

      const stats = classifyAndSummarize(records, legacyAesKey, newAesKey);
      printSummary(records.length, stats, false, isAuditOnly, 0);

      if (stats.countFailed > 0) {
        process.exitCode = 2;
      }
      return;
    }

    // LIVE EXECUTION (--apply):
    // Execute read -> evaluate -> conditional CAS updates inside a SINGLE Serializable transaction
    // to guarantee snapshot isolation, prevent TOCTOU concurrent-rotation overwrites, and ensure
    // all-or-nothing rollback on any failure.
    let totalCount = 0;
    let stats = null;
    let countSuccessfullyMigrated = 0;

    try {
      const txResult = await prisma.$transaction(
        async (tx) => {
          const records = await tx.issuerKey.findMany({
            orderBy: [{ tenantId: "asc" }, { keyEpoch: "asc" }],
            select: {
              id: true,
              tenantId: true,
              keyEpoch: true,
              keyIdentifier: true,
              encryptedPrivateKey: true,
            },
          });

          console.log(`Found ${records.length} IssuerKey record(s) in database.`);

          if (records.length === 0) {
            return {
              total: 0,
              stats: {
                countAlreadyMigrated: 0,
                countNeedMigration: 0,
                countSkipped: 0,
                countFailed: 0,
                updatesToApply: [],
                errors: [],
              },
              updated: 0,
              abortedOnValidation: false,
            };
          }

          const evalStats = classifyAndSummarize(records, legacyAesKey, newAesKey);

          if (evalStats.countFailed > 0) {
            return {
              total: records.length,
              stats: evalStats,
              updated: 0,
              abortedOnValidation: true,
            };
          }

          if (evalStats.updatesToApply.length === 0) {
            return {
              total: records.length,
              stats: evalStats,
              updated: 0,
              abortedOnValidation: false,
            };
          }

          console.log(
            `Applying ${evalStats.updatesToApply.length} update(s) atomically inside Serializable transaction...`
          );

          let updated = 0;
          for (const u of evalStats.updatesToApply) {
            const res = await tx.issuerKey.updateMany({
              where: {
                id: u.id,
                encryptedPrivateKey: u.oldEncrypted,
              },
              data: {
                encryptedPrivateKey: u.newEncrypted,
              },
            });

            if (res.count !== 1) {
              throw new Error(
                `Optimistic concurrency conflict while updating IssuerKey ID ${u.id}: expected 1 updated row, got ${res.count}. Rolling back entire transaction.`
              );
            }
            updated++;
          }

          return {
            total: records.length,
            stats: evalStats,
            updated,
            abortedOnValidation: false,
          };
        },
        {
          isolationLevel: "Serializable",
          maxWait: 10000,
          timeout: 60000,
        }
      );

      totalCount = txResult.total;
      stats = txResult.stats;
      countSuccessfullyMigrated = txResult.updated;

      if (totalCount === 0) {
        console.log("[INFO] Database contains 0 IssuerKey records. No migration needed.");
        return;
      }

      if (txResult.abortedOnValidation) {
        console.error(
          "FATAL: Aborting migration due to one or more decryption/validation errors. Zero changes committed."
        );
        printSummary(totalCount, stats, true, false, 0);
        process.exitCode = 2;
        return;
      }

      if (countSuccessfullyMigrated > 0) {
        console.log("[OK] Serializable transaction committed successfully.");
      }

      printSummary(totalCount, stats, true, false, countSuccessfullyMigrated);
    } catch (err) {
      console.error(
        `FATAL: Migration transaction aborted and rolled back cleanly. Zero changes committed. Details: ${sanitizeErrorText(err)}`
      );
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Unexpected fatal error:", sanitizeErrorText(err));
  process.exitCode = 1;
});
