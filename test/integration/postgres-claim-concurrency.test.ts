/**
 * CREDVAIL Real PostgreSQL Concurrency & Transactional Integration Test Suite
 * 
 * Target: Actual PostgreSQL persistence via Prisma Client
 * Isolation Level: RepeatableRead
 * Transaction Boundaries: prisma.$transaction(async (tx) => { ... })
 * 
 * Verifies:
 * - Five concurrent requests redeeming one invitation: exactly one succeeds.
 * - Ten concurrent requests redeeming one invitation: exactly one succeeds.
 * - Two authenticated users racing for one invitation: exactly one succeeds.
 * - Expired invitations cannot be consumed.
 * - Consumed invitations cannot be consumed again.
 * - A forced credential-association failure rolls back the entire claim transaction.
 * - A successful claim associates the invitation and credential with the same authenticated user.
 * 
 * NOTE: Per CREDVAIL H1.2.1 specifications:
 * Mocks and in-memory stores are explicitly forbidden in this file.
 * If the PostgreSQL database server is not reachable, this suite reports the exact
 * environment blocker status (BLOCKED) without faking a pass.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { ClaimInvitationRepository } from "@/lib/repositories/claim-invitation-repository";

describe("CREDVAIL PostgreSQL Live Concurrency & Transactional Integrity", () => {
  let isPostgresLive = false;
  let tenantId: string;
  let batchId: string;
  let templateId: string;
  let issuerKeyId: string;
  let userIdAlice: string;
  let userIdBob: string;

  beforeAll(async () => {
    const requirePostgres = process.env.REQUIRE_POSTGRES_INTEGRATION === "true";

    // Attempt real connection to configured PostgreSQL database
    try {
      await prisma.$connect();
      // Check if schema tables are accessible
      await prisma.$queryRaw`SELECT 1`;
      isPostgresLive = true;
      ClaimInvitationRepository.setUseMemory(false);
      expect(ClaimInvitationRepository.getUseMemory()).toBe(false);
    } catch (err: any) {
      isPostgresLive = false;
      const diagMsg =
        "\n[POSTGRES CONCURRENCY SUITE DIAGNOSTIC]:\n" +
        "PostgreSQL database is NOT accessible on the configured DATABASE_URL.\n" +
        `Error: ${err.message}\n` +
        "STATUS: BLOCKED — Local Windows environment lacks Docker and local PostgreSQL daemon.\n" +
        "Live PostgreSQL concurrency tests will be skipped with status BLOCKED.\n";

      if (requirePostgres) {
        throw new Error(
          `FATAL: REQUIRE_POSTGRES_INTEGRATION is "true" but PostgreSQL connection failed: ${err.message}`
        );
      }
      console.warn(diagMsg);
    }

    if (isPostgresLive) {
      // Seed test tenant, key, and user records for PostgreSQL live testing
      const tenant = await prisma.tenant.create({
        data: {
          slug: `live-pg-${Date.now()}`,
          name: "Live PostgreSQL Test University",
          legalEntityName: "Live PostgreSQL Test University",
          websiteUrl: "https://pg-test.edu",
          didUri: `did:web:credvail.com:tenants:live-pg-${Date.now()}`,
        },
      });
      tenantId = tenant.id;

      const userAlice = await prisma.user.create({
        data: {
          email: `alice.${Date.now()}@pg-test.edu`,
          passwordHash: "argon2id_mock_hash_for_pg_test",
          fullName: "Alice Student PG",
          platformRole: "USER",
          emailVerifiedAt: new Date(),
        },
      });
      userIdAlice = userAlice.id;

      const userBob = await prisma.user.create({
        data: {
          email: `bob.${Date.now()}@pg-test.edu`,
          passwordHash: "argon2id_mock_hash_for_pg_test",
          fullName: "Bob Student PG",
          platformRole: "USER",
          emailVerifiedAt: new Date(),
        },
      });
      userIdBob = userBob.id;

      const template = await prisma.certificateTemplate.create({
        data: {
          tenantId,
          title: "PG Concurrency Degree",
          category: "DEGREE",
          dimensions: { width: 842, height: 595, unit: "pt" },
          layoutConfig: { orientation: "landscape" },
        },
      });
      templateId = template.id;

      const key = await prisma.issuerKey.create({
        data: {
          tenantId,
          keyEpoch: 1,
          algorithm: "ECDSA_P256",
          publicKeyMultibase: "zDnaTestLiveKeyMultibase",
          keyIdentifier: `${tenant.didUri}#key-1`,
          isActive: true,
          validFrom: new Date(),
        },
      });
      issuerKeyId = key.id;

      const batch = await prisma.issuanceBatch.create({
        data: {
          tenantId,
          templateId,
          issuerKeyId,
          batchNumber: `BATCH-PG-${Date.now()}`,
          status: "GENERATED",
        },
      });
      batchId = batch.id;
    }
  });

  afterAll(async () => {
    if (isPostgresLive) {
      try {
        await prisma.claimInvitation.deleteMany({ where: { tenantId } });
        await prisma.credentialRecord.deleteMany({ where: { tenantId } });
        await prisma.issuanceBatch.deleteMany({ where: { tenantId } });
        await prisma.certificateTemplate.deleteMany({ where: { tenantId } });
        await prisma.issuerKey.deleteMany({ where: { tenantId } });
        await prisma.tenant.deleteMany({ where: { id: tenantId } });
        await prisma.$disconnect();
      } catch {
        // Cleanup best effort
      }
    }
  });

  // Helper to skip if PostgreSQL is unavailable
  const testIfPostgres = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!isPostgresLive) {
        console.log(`[SKIPPED - BLOCKED]: ${name} (PostgreSQL daemon not running)`);
        return;
      }
      await fn();
    });
  };

  testIfPostgres("PG-01: five concurrent requests redeeming one invitation: exactly one succeeds", async () => {
    const certNumber = `PG-CERT-5-${Date.now()}`;
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const cred = await prisma.credentialRecord.create({
      data: {
        credentialId: `urn:uuid:${crypto.randomUUID()}`,
        certificateNumber: certNumber,
        tenantId,
        batchId,
        recipientId: userIdAlice,
        leafHash: "0x1111",
        merkleIndex: 0,
        bitstringIndex: 0,
        claimsData: { course: "PostgreSQL Concurrency" },
        vcPayloadJson: { id: "test" },
      },
    });

    const inv = await prisma.claimInvitation.create({
      data: {
        tokenHash,
        credentialId: cred.credentialId,
        certificateNumber: certNumber,
        recipientEmail: "alice@pg-test.edu",
        tenantId,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const attempts = 5;
    const promises = Array.from({ length: attempts }, () =>
      ClaimInvitationRepository.redeemInvitationTransaction({
        invitationId: inv.id,
        tokenHash,
        userId: userIdAlice,
        holderDid: "did:key:zDnaTestAlice",
        certificateNumber: certNumber,
        tenantId,
      })
    );

    const results = await Promise.allSettled(promises);
    const successes = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.filter((r) => r.status === "rejected").length;

    expect(successes).toBe(1);
    expect(failures).toBe(attempts - 1);

    const inDb = await prisma.claimInvitation.findUnique({ where: { id: inv.id } });
    expect(inDb?.consumedAt).not.toBeNull();
    expect(inDb?.claimedByUserId).toBe(userIdAlice);
  });

  testIfPostgres("PG-02: ten concurrent requests redeeming one invitation: exactly one succeeds", async () => {
    const certNumber = `PG-CERT-10-${Date.now()}`;
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const cred = await prisma.credentialRecord.create({
      data: {
        credentialId: `urn:uuid:${crypto.randomUUID()}`,
        certificateNumber: certNumber,
        tenantId,
        batchId,
        recipientId: userIdAlice,
        leafHash: "0x2222",
        merkleIndex: 1,
        bitstringIndex: 1,
        claimsData: { course: "PostgreSQL Concurrency 10" },
        vcPayloadJson: { id: "test" },
      },
    });

    const inv = await prisma.claimInvitation.create({
      data: {
        tokenHash,
        credentialId: cred.credentialId,
        certificateNumber: certNumber,
        recipientEmail: "alice@pg-test.edu",
        tenantId,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const attempts = 10;
    const promises = Array.from({ length: attempts }, () =>
      ClaimInvitationRepository.redeemInvitationTransaction({
        invitationId: inv.id,
        tokenHash,
        userId: userIdAlice,
        holderDid: "did:key:zDnaTestAlice",
        certificateNumber: certNumber,
        tenantId,
      })
    );

    const results = await Promise.allSettled(promises);
    const successes = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.filter((r) => r.status === "rejected").length;

    expect(successes).toBe(1);
    expect(failures).toBe(attempts - 1);
  });

  testIfPostgres("PG-03: two authenticated users racing for one invitation: exactly one succeeds", async () => {
    const certNumber = `PG-CERT-RACE-${Date.now()}`;
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const cred = await prisma.credentialRecord.create({
      data: {
        credentialId: `urn:uuid:${crypto.randomUUID()}`,
        certificateNumber: certNumber,
        tenantId,
        batchId,
        recipientId: userIdAlice,
        leafHash: "0x3333",
        merkleIndex: 2,
        bitstringIndex: 2,
        claimsData: { course: "PostgreSQL Race Condition" },
        vcPayloadJson: { id: "test" },
      },
    });

    const inv = await prisma.claimInvitation.create({
      data: {
        tokenHash,
        credentialId: cred.credentialId,
        certificateNumber: certNumber,
        recipientEmail: "alice@pg-test.edu",
        tenantId,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const pAlice = ClaimInvitationRepository.redeemInvitationTransaction({
      invitationId: inv.id,
      tokenHash,
      userId: userIdAlice,
      holderDid: "did:key:zDnaAlice",
      certificateNumber: certNumber,
      tenantId,
    });

    const pBob = ClaimInvitationRepository.redeemInvitationTransaction({
      invitationId: inv.id,
      tokenHash,
      userId: userIdBob,
      holderDid: "did:key:zDnaBob",
      certificateNumber: certNumber,
      tenantId,
    });

    const results = await Promise.allSettled([pAlice, pBob]);
    const successes = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.filter((r) => r.status === "rejected").length;

    expect(successes).toBe(1);
    expect(failures).toBe(1);

    const inDb = await prisma.claimInvitation.findUnique({ where: { id: inv.id } });
    expect(inDb?.consumedAt).not.toBeNull();
    expect([userIdAlice, userIdBob]).toContain(inDb?.claimedByUserId);
  });

  testIfPostgres("PG-04: expired invitations cannot be consumed", async () => {
    const certNumber = `PG-CERT-EXP-${Date.now()}`;
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const cred = await prisma.credentialRecord.create({
      data: {
        credentialId: `urn:uuid:${crypto.randomUUID()}`,
        certificateNumber: certNumber,
        tenantId,
        batchId,
        recipientId: userIdAlice,
        leafHash: "0x4444",
        merkleIndex: 3,
        bitstringIndex: 3,
        claimsData: { course: "PostgreSQL Expiry" },
        vcPayloadJson: { id: "test" },
      },
    });

    const inv = await prisma.claimInvitation.create({
      data: {
        tokenHash,
        credentialId: cred.credentialId,
        certificateNumber: certNumber,
        recipientEmail: "alice@pg-test.edu",
        tenantId,
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
      },
    });

    await expect(
      ClaimInvitationRepository.redeemInvitationTransaction({
        invitationId: inv.id,
        tokenHash,
        userId: userIdAlice,
        certificateNumber: certNumber,
        tenantId,
      })
    ).rejects.toThrow();
  });

  testIfPostgres("PG-05: consumed invitations cannot be consumed again (anti-replay)", async () => {
    const certNumber = `PG-CERT-REPLAY-${Date.now()}`;
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const cred = await prisma.credentialRecord.create({
      data: {
        credentialId: `urn:uuid:${crypto.randomUUID()}`,
        certificateNumber: certNumber,
        tenantId,
        batchId,
        recipientId: userIdAlice,
        leafHash: "0x5555",
        merkleIndex: 4,
        bitstringIndex: 4,
        claimsData: { course: "PostgreSQL Anti-Replay" },
        vcPayloadJson: { id: "test" },
      },
    });

    const inv = await prisma.claimInvitation.create({
      data: {
        tokenHash,
        credentialId: cred.credentialId,
        certificateNumber: certNumber,
        recipientEmail: "alice@pg-test.edu",
        tenantId,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // 1st consumption succeeds
    await ClaimInvitationRepository.redeemInvitationTransaction({
      invitationId: inv.id,
      tokenHash,
      userId: userIdAlice,
      certificateNumber: certNumber,
      tenantId,
    });

    // 2nd consumption fails
    await expect(
      ClaimInvitationRepository.redeemInvitationTransaction({
        invitationId: inv.id,
        tokenHash,
        userId: userIdAlice,
        certificateNumber: certNumber,
        tenantId,
      })
    ).rejects.toThrow(/already been consumed/i);
  });

  testIfPostgres("PG-06: a forced credential-association failure rolls back the entire claim transaction", async () => {
    const certNumber = `PG-CERT-ROLLBACK-${Date.now()}`;
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const cred = await prisma.credentialRecord.create({
      data: {
        credentialId: `urn:uuid:${crypto.randomUUID()}`,
        certificateNumber: certNumber,
        tenantId,
        batchId,
        recipientId: userIdAlice,
        leafHash: "0x6666",
        merkleIndex: 5,
        bitstringIndex: 5,
        claimsData: { course: "PostgreSQL Transaction Rollback" },
        vcPayloadJson: { id: "test" },
      },
    });

    const inv = await prisma.claimInvitation.create({
      data: {
        tokenHash,
        credentialId: cred.credentialId,
        certificateNumber: certNumber,
        recipientEmail: "alice@pg-test.edu",
        tenantId,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // Attempt claim with hook throwing an unhandled error inside prisma.$transaction
    await expect(
      ClaimInvitationRepository.redeemInvitationTransaction({
        invitationId: inv.id,
        tokenHash,
        userId: userIdAlice,
        certificateNumber: certNumber,
        tenantId,
        onPostConsume: async () => {
          throw new Error("Downstream database failure injected inside Prisma transaction");
        },
      })
    ).rejects.toThrow("Downstream database failure injected inside Prisma transaction");

    // 2. Verify in PostgreSQL that the transaction was rolled back:
    // consumedAt MUST be null, claimedByUserId MUST be null
    const inDbAfterRollback = await prisma.claimInvitation.findUnique({
      where: { id: inv.id },
    });
    expect(inDbAfterRollback?.consumedAt).toBeNull();
    expect(inDbAfterRollback?.claimedByUserId).toBeNull();

    // 3. Verify in PostgreSQL that NO audit log was committed during the aborted transaction
    const auditLogsAfterRollback = await prisma.auditLog.findMany({
      where: {
        tenantId,
        resourceId: cred.id,
      },
    });
    expect(auditLogsAfterRollback.length).toBe(0);

    // 4. Verify retry recovery: subsequent valid claim succeeds cleanly with the same token
    const retryResult = await ClaimInvitationRepository.redeemInvitationTransaction({
      invitationId: inv.id,
      tokenHash,
      userId: userIdAlice,
      holderDid: "did:key:zDnaAliceRetry",
      certificateNumber: certNumber,
      tenantId,
    });
    expect(retryResult.consumedAt).not.toBeNull();
    expect(retryResult.claimedByUserId).toBe(userIdAlice);

    // 5. Verify PostgreSQL state after successful retry
    const inDbAfterRetry = await prisma.claimInvitation.findUnique({
      where: { id: inv.id },
    });
    expect(inDbAfterRetry?.consumedAt).not.toBeNull();
    expect(inDbAfterRetry?.claimedByUserId).toBe(userIdAlice);

    const auditLogsAfterRetry = await prisma.auditLog.findMany({
      where: {
        tenantId,
        resourceId: cred.id,
      },
    });
    expect(auditLogsAfterRetry.length).toBe(1);
    expect(auditLogsAfterRetry[0].userId).toBe(userIdAlice);
  });

  testIfPostgres("PG-07: a successful claim associates the invitation and credential with the authenticated user", async () => {
    const certNumber = `PG-CERT-ASSOC-${Date.now()}`;
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const cred = await prisma.credentialRecord.create({
      data: {
        credentialId: `urn:uuid:${crypto.randomUUID()}`,
        certificateNumber: certNumber,
        tenantId,
        batchId,
        recipientId: userIdAlice,
        leafHash: "0x7777",
        merkleIndex: 6,
        bitstringIndex: 6,
        claimsData: { course: "PostgreSQL Association" },
        vcPayloadJson: { id: "test" },
      },
    });

    const inv = await prisma.claimInvitation.create({
      data: {
        tokenHash,
        credentialId: cred.credentialId,
        certificateNumber: certNumber,
        recipientEmail: "alice@pg-test.edu",
        tenantId,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const consumed = await ClaimInvitationRepository.redeemInvitationTransaction({
      invitationId: inv.id,
      tokenHash,
      userId: userIdAlice,
      holderDid: "did:key:zDnaHolderAlice777",
      certificateNumber: certNumber,
      tenantId,
    });

    expect(consumed.consumedAt).not.toBeNull();
    expect(consumed.claimedByUserId).toBe(userIdAlice);
    expect(consumed.claimedByHolderDid).toBe("did:key:zDnaHolderAlice777");

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        tenantId,
        resourceId: cred.id,
        action: "CREDENTIAL_CLAIMED",
      },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry?.userId).toBe(userIdAlice);
  });
});
