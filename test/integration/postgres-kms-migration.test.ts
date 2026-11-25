/**
 * CREDVAIL Real PostgreSQL KMS Key Migration & Cryptographic Integrity Integration Suite (CRV-SEC-01.2)
 *
 * Executes the actual `scripts/migrate-issuer-keys.mjs` CLI and CREDVAIL cryptographic services
 * against a live PostgreSQL database with ZERO mocks.
 *
 * Covers Matrix MIG-01 through MIG-15 plus Phase F End-to-End W3C VC Sign & Verify Integrity.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { KeyService } from "@/lib/crypto/key-service";
import { KeyRepository } from "@/lib/repositories/key-repository";
import { KeyManagementService } from "@/lib/services/key-management-service";
import { VcService } from "@/lib/crypto/vc-service";

function createTestClient(): PrismaClient {
  return new PrismaClient();
}

function deriveLegacySha256(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptAesGcm(plaintext: string, keyBuf: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes-256-gcm:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function sha256Short(val: string | null): string {
  return crypto.createHash("sha256").update(val || "").digest("hex").slice(0, 16);
}

describe("CREDVAIL Live PostgreSQL KMS Issuer-Key Migration Suite (CRV-SEC-01.2)", () => {
  let isPostgresLive = false;
  let prisma: PrismaClient;

  const TEST_LEGACY_SECRET = "test_only_credvail_legacy_secret_sec012_integration";
  const TEST_WRONG_LEGACY = "test_only_wrong_legacy_secret_sec012_integration";
  const TEST_NEW_KMS_KEY = crypto.randomBytes(32).toString("base64");
  const TEST_NONCANONICAL_KMS = crypto.randomBytes(16).toString("base64");

  const createdTenantIds: string[] = [];

  function runMigrationCli(
    args: string[],
    envPatch: Record<string, string | undefined>
  ): { exitCode: number; stdout: string; stderr: string } {
    const env: Record<string, string | undefined> = {
      ...process.env,
    };
    delete env.KMS_MASTER_KEY;
    delete env.LEGACY_SESSION_SECRET;
    delete env.SESSION_SECRET;

    for (const [k, v] of Object.entries(envPatch)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }

    try {
      const stdout = execFileSync("node", ["scripts/migrate-issuer-keys.mjs", ...args], {
        env: env as NodeJS.ProcessEnv,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { exitCode: 0, stdout: stdout.trim(), stderr: "" };
    } catch (err: any) {
      return {
        exitCode: err.status ?? -1,
        stdout: String(err.stdout || "").trim(),
        stderr: String(err.stderr || "").trim(),
      };
    }
  }

  async function createIsolatedTenant(prefix: string) {
    const slug = `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    const tenant = await prisma.tenant.create({
      data: {
        slug,
        name: `Test Institution ${slug}`,
        legalEntityName: `Test Institution ${slug} LLC`,
        websiteUrl: `https://${slug}.example.edu`,
        didUri: `did:web:credvail.test:tenants:${slug}`,
      },
    });
    createdTenantIds.push(tenant.id);
    return tenant;
  }

  async function cleanupCreatedTenants() {
    if (!isPostgresLive || createdTenantIds.length === 0) return;
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_test_mig_rollback ON "issuer_keys"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS trg_mig_abort_second_update()`);
    await prisma.issuerKey.deleteMany({
      where: { tenantId: { in: createdTenantIds } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: createdTenantIds } },
    });
    createdTenantIds.length = 0;
  }

  beforeAll(async () => {
    const requirePostgres = process.env.REQUIRE_POSTGRES_INTEGRATION === "true";
    prisma = createTestClient();
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      isPostgresLive = true;
    } catch (err: any) {
      isPostgresLive = false;
      if (requirePostgres) {
        throw new Error(
          `FATAL: REQUIRE_POSTGRES_INTEGRATION is "true" but PostgreSQL connection failed: ${err.message}`
        );
      }
      console.warn(
        `[POSTGRES KMS MIGRATION SUITE]: PostgreSQL unreachable; live PG tests skipped. (${err.message})`
      );
    }
  });

  beforeEach(async () => {
    if (!isPostgresLive) return;
    KeyRepository.resetInMemoryStore();
    KeyService.resetMasterKeyForTesting();
    // Clean any test tenants created by prior tests in this file
    await cleanupCreatedTenants();
  });

  afterAll(async () => {
    if (isPostgresLive) {
      await cleanupCreatedTenants();
      await prisma.$disconnect();
    }
  });

  it("MIG-01 & MIG-07 & MIG-08 & MIG-09: empty table no-op and preflight secret rejections", async (ctx: { skip: () => void }) => {
    if (!isPostgresLive) return ctx.skip();

    // Ensure issuer_keys is clean for empty-table check (check total)
    const countBefore = await prisma.issuerKey.count();
    if (countBefore === 0) {
      const emptyDry = runMigrationCli([], {
        KMS_MASTER_KEY: TEST_NEW_KMS_KEY,
        LEGACY_SESSION_SECRET: TEST_LEGACY_SECRET,
      });
      expect(emptyDry.exitCode).toBe(0);
      expect(emptyDry.stdout).toMatch(/Database contains 0 IssuerKey records/i);
    }

    // MIG-08: Missing KMS_MASTER_KEY -> preflight exit 1
    const resMissingKms = runMigrationCli([], {
      LEGACY_SESSION_SECRET: TEST_LEGACY_SECRET,
    });
    expect(resMissingKms.exitCode).toBe(1);
    expect(resMissingKms.stderr).toMatch(/KMS_MASTER_KEY environment variable is missing/i);

    // MIG-09: Invalid KMS_MASTER_KEY length/encoding -> preflight exit 1
    const resBadKms = runMigrationCli([], {
      KMS_MASTER_KEY: TEST_NONCANONICAL_KMS,
      LEGACY_SESSION_SECRET: TEST_LEGACY_SECRET,
    });
    expect(resBadKms.exitCode).toBe(1);
    expect(resBadKms.stderr).toMatch(/Invalid KMS_MASTER_KEY/i);

    // MIG-07: Missing legacy secret -> preflight exit 1
    const resMissingLegacy = runMigrationCli(["--apply"], {
      KMS_MASTER_KEY: TEST_NEW_KMS_KEY,
    });
    expect(resMissingLegacy.exitCode).toBe(1);
    expect(resMissingLegacy.stderr).toMatch(/LEGACY_SESSION_SECRET environment variable is missing/i);
  });

  it("MIG-02, MIG-03, MIG-04, MIG-05, MIG-13, MIG-14: dry-run read-only, selective mixed apply, and idempotency", async (ctx: { skip: () => void }) => {
    if (!isPostgresLive) return ctx.skip();

    const tenantA = await createIsolatedTenant("mig-a");
    const tenantB = await createIsolatedTenant("mig-b");

    const legacyKeyBuf = deriveLegacySha256(TEST_LEGACY_SECRET);
    KeyService.setMasterKeyForTesting(TEST_NEW_KMS_KEY);

    const kp1 = KeyService.generateEcdsaKeyPair();
    const kp2 = KeyService.generateEcdsaKeyPair();
    const kp3 = KeyService.generateEcdsaKeyPair();
    const kpAlready = KeyService.generateEcdsaKeyPair();

    const row1 = await prisma.issuerKey.create({
      data: {
        tenantId: tenantA.id,
        keyEpoch: 1,
        keyIdentifier: `${tenantA.didUri}#key-1`,
        publicKeyMultibase: kp1.publicKeyMultibase,
        encryptedPrivateKey: encryptAesGcm(kp1.privateKeyPem, legacyKeyBuf),
        isActive: false,
      },
    });
    const row2 = await prisma.issuerKey.create({
      data: {
        tenantId: tenantA.id,
        keyEpoch: 2,
        keyIdentifier: `${tenantA.didUri}#key-2`,
        publicKeyMultibase: kp2.publicKeyMultibase,
        encryptedPrivateKey: encryptAesGcm(kp2.privateKeyPem, legacyKeyBuf),
        isActive: true,
      },
    });
    const rowAlready = await prisma.issuerKey.create({
      data: {
        tenantId: tenantA.id,
        keyEpoch: 3,
        keyIdentifier: `${tenantA.didUri}#key-3`,
        publicKeyMultibase: kpAlready.publicKeyMultibase,
        encryptedPrivateKey: KeyService.encryptPrivateKey(kpAlready.privateKeyPem),
        isActive: false,
      },
    });
    const row3 = await prisma.issuerKey.create({
      data: {
        tenantId: tenantB.id,
        keyEpoch: 1,
        keyIdentifier: `${tenantB.didUri}#key-1`,
        publicKeyMultibase: kp3.publicKeyMultibase,
        encryptedPrivateKey: encryptAesGcm(kp3.privateKeyPem, legacyKeyBuf),
        isActive: true,
      },
    });

    const snapshotHashes = async () => {
      const rows = await prisma.issuerKey.findMany({
        where: { id: { in: [row1.id, row2.id, rowAlready.id, row3.id] } },
      });
      return Object.fromEntries(rows.map((r) => [r.id, r.encryptedPrivateKey]));
    };

    const initialMap = await snapshotHashes();

    // MIG-13: Repeated dry-run executes read-only with zero mutations
    for (let i = 0; i < 2; i++) {
      const dry = runMigrationCli([], {
        KMS_MASTER_KEY: TEST_NEW_KMS_KEY,
        LEGACY_SESSION_SECRET: TEST_LEGACY_SECRET,
      });
      expect(dry.exitCode).toBe(0);
      expect(dry.stdout).toMatch(/Pending\/eligible migration:\s+3/);
      expect(dry.stdout).toMatch(/Already on new KMS key:\s+1/);
      expect(dry.stdout).not.toContain("BEGIN PRIVATE KEY");
      expect(await snapshotHashes()).toEqual(initialMap);
    }

    // MIG-03, MIG-04, MIG-05: Execute --apply
    const apply1 = runMigrationCli(["--apply"], {
      KMS_MASTER_KEY: TEST_NEW_KMS_KEY,
      LEGACY_SESSION_SECRET: TEST_LEGACY_SECRET,
    });
    expect(apply1.exitCode).toBe(0);
    expect(apply1.stdout).toMatch(/Successfully updated in DB:\s+3/);
    expect(apply1.stdout).not.toContain("BEGIN PRIVATE KEY");

    const afterApply1 = await snapshotHashes();
    // Already-migrated row MUST stay byte-for-byte untouched (no double encryption)
    expect(afterApply1[rowAlready.id]).toBe(initialMap[rowAlready.id]);
    // All 3 legacy rows updated
    expect(afterApply1[row1.id]).not.toBe(initialMap[row1.id]);
    expect(afterApply1[row2.id]).not.toBe(initialMap[row2.id]);
    expect(afterApply1[row3.id]).not.toBe(initialMap[row3.id]);

    // MIG-14: Repeated --apply is completely idempotent
    const apply2 = runMigrationCli(["--apply"], {
      KMS_MASTER_KEY: TEST_NEW_KMS_KEY,
      LEGACY_SESSION_SECRET: TEST_LEGACY_SECRET,
    });
    expect(apply2.exitCode).toBe(0);
    expect(apply2.stdout).toMatch(/Already on new KMS key:\s+4/);
    expect(apply2.stdout).toMatch(/Successfully updated in DB:\s+0/);
    expect(await snapshotHashes()).toEqual(afterApply1);

    // Post-migration --audit-kms-only succeeds without LEGACY_SESSION_SECRET
    const auditOnly = runMigrationCli(["--audit-kms-only"], {
      KMS_MASTER_KEY: TEST_NEW_KMS_KEY,
    });
    expect(auditOnly.exitCode).toBe(0);
    expect(auditOnly.stdout).toMatch(/Already on new KMS key:\s+4/);
    expect(auditOnly.stdout).toMatch(/Decryption\/verify failures:\s+0/);
  });

  it("MIG-06, MIG-10, MIG-11, MIG-12: wrong secret, corrupted ciphertext, invalid auth tag, and transaction rollback", async (ctx: { skip: () => void }) => {
    if (!isPostgresLive) return ctx.skip();

    const tenant = await createIsolatedTenant("mig-fail");
    const legacyKeyBuf = deriveLegacySha256(TEST_LEGACY_SECRET);
    const kpValid = KeyService.generateEcdsaKeyPair();
    const kpTarget = KeyService.generateEcdsaKeyPair();

    const validLegacyCipher = encryptAesGcm(kpValid.privateKeyPem, legacyKeyBuf);
    const secondLegacyCipher = encryptAesGcm(kpTarget.privateKeyPem, legacyKeyBuf);

    // MIG-06: Wrong legacy secret -> fails closed with zero mutations
    const rowValid = await prisma.issuerKey.create({
      data: {
        tenantId: tenant.id,
        keyEpoch: 1,
        keyIdentifier: `${tenant.didUri}#key-1`,
        publicKeyMultibase: kpValid.publicKeyMultibase,
        encryptedPrivateKey: validLegacyCipher,
        isActive: false,
      },
    });
    const wrongRes = runMigrationCli(["--apply"], {
      KMS_MASTER_KEY: TEST_NEW_KMS_KEY,
      LEGACY_SESSION_SECRET: TEST_WRONG_LEGACY,
    });
    expect(wrongRes.exitCode).toBe(2);
    expect((await prisma.issuerKey.findUnique({ where: { id: rowValid.id } }))?.encryptedPrivateKey).toBe(
      validLegacyCipher
    );

    // MIG-10 & MIG-11: Add corrupted ciphertext (bad body) and tampered auth tag alongside valid legacy key
    const parts = secondLegacyCipher.split(":");
    const tamperedBodyCipher = `aes-256-gcm:${parts[1]}:${parts[2]}:${parts[3].slice(0, -2)}${parts[3].endsWith("00") ? "ff" : "00"}`;
    const tamperedTag = (parts[2].startsWith("a") ? "b" : "a") + parts[2].slice(1);
    const tamperedTagCipher = `aes-256-gcm:${parts[1]}:${tamperedTag}:${parts[3]}`;

    const rowCorrupt = await prisma.issuerKey.create({
      data: {
        tenantId: tenant.id,
        keyEpoch: 2,
        keyIdentifier: `${tenant.didUri}#key-2`,
        publicKeyMultibase: kpTarget.publicKeyMultibase,
        encryptedPrivateKey: tamperedBodyCipher,
        isActive: false,
      },
    });
    const rowBadTag = await prisma.issuerKey.create({
      data: {
        tenantId: tenant.id,
        keyEpoch: 3,
        keyIdentifier: `${tenant.didUri}#key-3`,
        publicKeyMultibase: kpTarget.publicKeyMultibase,
        encryptedPrivateKey: tamperedTagCipher,
        isActive: false,
      },
    });

    const mixedFailRes = runMigrationCli(["--apply"], {
      KMS_MASTER_KEY: TEST_NEW_KMS_KEY,
      LEGACY_SESSION_SECRET: TEST_LEGACY_SECRET,
    });
    expect(mixedFailRes.exitCode).toBe(2);
    expect(mixedFailRes.stderr).toMatch(/FAILED_DECRYPTION/);
    // Valid row MUST NOT be partially migrated when other records fail validation
    expect((await prisma.issuerKey.findUnique({ where: { id: rowValid.id } }))?.encryptedPrivateKey).toBe(
      validLegacyCipher
    );
    expect((await prisma.issuerKey.findUnique({ where: { id: rowCorrupt.id } }))?.encryptedPrivateKey).toBe(
      tamperedBodyCipher
    );
    expect((await prisma.issuerKey.findUnique({ where: { id: rowBadTag.id } }))?.encryptedPrivateKey).toBe(
      tamperedTagCipher
    );

    // Replace corrupted rows with valid legacy row to test genuine mid-transaction SQL rollback (MIG-12)
    await prisma.issuerKey.deleteMany({ where: { id: { in: [rowCorrupt.id, rowBadTag.id] } } });
    const rowSecondValid = await prisma.issuerKey.create({
      data: {
        tenantId: tenant.id,
        keyEpoch: 2,
        keyIdentifier: `${tenant.didUri}#key-2`,
        publicKeyMultibase: kpTarget.publicKeyMultibase,
        encryptedPrivateKey: secondLegacyCipher,
        isActive: true,
      },
    });

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION trg_mig_abort_second_update()
      RETURNS TRIGGER AS $$
      DECLARE cnt integer;
      BEGIN
        cnt := COALESCE(current_setting('credvail.test_mig_cnt', true), '0')::int + 1;
        PERFORM set_config('credvail.test_mig_cnt', cnt::text, true);
        IF cnt >= 2 THEN
          RAISE EXCEPTION 'INJECTED_MID_TX_ROLLBACK_ON_ROW_2';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_test_mig_rollback ON "issuer_keys"`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER trg_test_mig_rollback
      BEFORE UPDATE ON "issuer_keys"
      FOR EACH ROW EXECUTE FUNCTION trg_mig_abort_second_update();
    `);

    const rbRes = runMigrationCli(["--apply"], {
      KMS_MASTER_KEY: TEST_NEW_KMS_KEY,
      LEGACY_SESSION_SECRET: TEST_LEGACY_SECRET,
    });
    expect(rbRes.exitCode).toBe(1);
    expect(rbRes.stderr).toMatch(/rolled back cleanly/i);

    // Verify Row 1 AND Row 2 retained exact original legacy ciphertexts after rollback
    expect((await prisma.issuerKey.findUnique({ where: { id: rowValid.id } }))?.encryptedPrivateKey).toBe(
      validLegacyCipher
    );
    expect((await prisma.issuerKey.findUnique({ where: { id: rowSecondValid.id } }))?.encryptedPrivateKey).toBe(
      secondLegacyCipher
    );

    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_test_mig_rollback ON "issuer_keys"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS trg_mig_abort_second_update()`);
  });

  it("MIG-15 & Phase F: KMS decryption, issuer identity preservation, and end-to-end W3C VC signing after migration", async (ctx: { skip: () => void }) => {
    if (!isPostgresLive) return ctx.skip();

    const tenant = await createIsolatedTenant("mig-crypt");
    const kp = KeyService.generateEcdsaKeyPair();
    const legacyCipher = encryptAesGcm(kp.privateKeyPem, deriveLegacySha256(TEST_LEGACY_SECRET));

    const dbRow = await prisma.issuerKey.create({
      data: {
        tenantId: tenant.id,
        keyEpoch: 1,
        keyIdentifier: `${tenant.didUri}#key-1`,
        publicKeyMultibase: kp.publicKeyMultibase,
        encryptedPrivateKey: legacyCipher,
        isActive: true,
      },
    });

    // Sign VC BEFORE migration using original key
    const preMigrationVc = VcService.signCredential(
      VcService.buildUnsignedCredential({
        credentialId: `urn:uuid:${crypto.randomUUID()}`,
        certificateNumber: `MIG-PRE-${Date.now()}`,
        tenantDidUri: tenant.didUri,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        recipientId: "rec_1",
        recipientName: "Ada Lovelace",
        recipientEmail: "ada@example.edu",
        claims: { course_name: "Pre-Migration Cert" },
        batchId: "batch_pre",
        merkleIndex: 0,
        bitstringIndex: 0,
      }),
      kp.privateKeyPem,
      dbRow.keyIdentifier
    );

    // Run live migration
    const applyRes = runMigrationCli(["--apply"], {
      KMS_MASTER_KEY: TEST_NEW_KMS_KEY,
      LEGACY_SESSION_SECRET: TEST_LEGACY_SECRET,
    });
    expect(applyRes.exitCode).toBe(0);

    // Force application code path to use live PostgreSQL & new KMS key (not test double)
    const savedKms = process.env.KMS_MASTER_KEY;
    const savedRequirePg = process.env.REQUIRE_POSTGRES_INTEGRATION;
    process.env.KMS_MASTER_KEY = TEST_NEW_KMS_KEY;
    process.env.REQUIRE_POSTGRES_INTEGRATION = "true";
    KeyService.resetMasterKeyForTesting();
    KeyRepository.resetInMemoryStore();

    try {
      expect(KeyRepository.getUseMemory()).toBe(false);
      const { key: hydrated, decryptedPrivateKey } = await KeyManagementService.getActiveSigningKey(tenant.slug);

      // Verify identity & public key unchanged
      expect(hydrated.id).toBe(dbRow.id);
      expect(hydrated.keyIdentifier).toBe(`${tenant.didUri}#key-1`);
      expect(hydrated.publicKeyMultibase).toBe(kp.publicKeyMultibase);
      expect(hydrated.publicKeyPem).toBe(kp.publicKeyPem);
      expect(hydrated.publicKeyJwk).toEqual(kp.publicKeyJwk);
      expect(hydrated.fingerprint).toBe(kp.fingerprint);

      // Verify private key digest matches original without logging key
      expect(sha256Short(decryptedPrivateKey)).toBe(sha256Short(kp.privateKeyPem));

      // Sign NEW VC through migrated key recovered via normal KMS path
      const postMigrationVc = VcService.signCredential(
        VcService.buildUnsignedCredential({
          credentialId: `urn:uuid:${crypto.randomUUID()}`,
          certificateNumber: `MIG-POST-${Date.now()}`,
          tenantDidUri: tenant.didUri,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          recipientId: "rec_2",
          recipientName: "Alan Turing",
          recipientEmail: "alan@example.edu",
          claims: { course_name: "Post-Migration Cert" },
          batchId: "batch_post",
          merkleIndex: 0,
          bitstringIndex: 0,
        }),
        decryptedPrivateKey,
        hydrated.keyIdentifier
      );

      const didDoc = await KeyManagementService.getTenantDidDocument(tenant.slug);
      expect(didDoc.id).toBe(tenant.didUri);
      expect(VcService.verifyCredentialSignature(postMigrationVc, kp.publicKeyPem)).toBe(true);
      expect(VcService.verifyCredentialSignature(postMigrationVc, didDoc.verificationMethod[0].publicKeyJwk)).toBe(
        true
      );
      expect(VcService.verifyCredentialSignature(preMigrationVc, hydrated.publicKeyPem)).toBe(true);
    } finally {
      if (savedKms === undefined) delete process.env.KMS_MASTER_KEY;
      else process.env.KMS_MASTER_KEY = savedKms;
      if (savedRequirePg === undefined) delete process.env.REQUIRE_POSTGRES_INTEGRATION;
      else process.env.REQUIRE_POSTGRES_INTEGRATION = savedRequirePg;
      KeyService.resetMasterKeyForTesting();
      KeyRepository.resetInMemoryStore();
    }
  });
});
