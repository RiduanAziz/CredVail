/**
 * CREDVAIL Real PostgreSQL Durable Wallet Ownership Integration Suite (H1.3.3 / H1.3.3.1)
 *
 * Target: Actual PostgreSQL persistence via Prisma Client
 * Focus: Single-owner credential integrity (partial unique index), durable wallet retrieval,
 *        ownership authorization, cross-user isolation, replay protection preservation,
 *        and fail-closed storage resilience.
 *
 * Test Matrix (H133-01 to H133-12):
 * - H133-01: Successful claimed credential remains retrievable after clearing process-local wallet cache
 * - H133-02: Independent Prisma clients retrieve the same claimed credential
 * - H133-03: User A cannot list User B's claimed credentials
 * - H133-04: Unclaimed invitations and foreign tenant records are excluded
 * - H133-05: Exact credential identifier and certificate-number ownership succeeds for the rightful claimant
 * - H133-06: Mismatched certificate numbers and credential identifiers fail ownership
 * - H133-07: Empty in-memory wallet cannot bypass the presentation ownership check
 * - H133-08: Two separate invitations for the same credential cannot establish two different owners, including concurrent redemption
 * - H133-09: GET wallet API ignores arbitrary caller-supplied userId and holderId parameters
 * - H133-10: Presentation endpoint rejects all foreign or unclaimed embedded credentials before challenge verification; verifier nonce stays unconsumed
 * - H133-11: Legitimate claimant can retrieve and authorize a presentation after cache clearing and independent-client access
 * - H133-12: Database outage produces sanitized HTTP 503 behavior for wallet retrieval and presentation ownership
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  WalletCredentialRepository,
  PrismaWalletCredentialRepository,
  WalletStorageUnavailableError,
  type IWalletCredentialRepository,
} from "@/lib/repositories/wallet-credential-repository";
import {
  WalletService,
  CredentialAlreadyClaimedError,
} from "@/lib/wallet/wallet-service";
import { VerificationService } from "@/lib/services/verification-service";
import { hashNonce } from "@/lib/repositories/challenge-nonce-repository";
import { KeyService } from "@/lib/crypto/key-service";
import { VcService } from "@/lib/crypto/vc-service";
import { canonicalizeJson } from "@/lib/crypto/canonical";
import { createSessionToken } from "@/lib/auth/session";
import { ClaimInvitationService } from "@/lib/services/claim-invitation-service";
import { ClaimInvitationRepository } from "@/lib/repositories/claim-invitation-repository";
import { GET as getCredentialsRoute } from "@/app/api/v1/wallet/credentials/route";
import { POST as presentRoute } from "@/app/api/v1/wallet/present/route";

describe("CREDVAIL PostgreSQL Live Wallet Ownership & Single-Owner Integrity (H1.3.3.1)", () => {
  let isPostgresLive = false;
  const defaultAudience = "https://verifier.credvail.test";

  // Persistent fixtures
  let tenantId: string;
  let foreignTenantId: string;
  let templateId: string;
  let issuerKeyId: string;
  let batchId: string;
  let recipientIdAlice: string;
  let recipientIdBob: string;
  let recipientIdForeign: string;
  let userIdAlice: string;
  let userIdBob: string;
  let aliceEmail: string;
  let bobEmail: string;
  let aliceSessionToken: string;
  let bobSessionToken: string;

  // Credential records
  let credAlice: any;
  let credBob: any;
  let credUnclaimed: any;
  let credForeignTenant: any;
  let signedVcAlice: any;
  let signedVcBob: any;
  let signedVcUnclaimed: any;
  let issuerKeyPair: any;

  // Track created entities for FK-safe teardown
  const createdNonceHashes: string[] = [];
  const testClients: PrismaClient[] = [];

  const createSignedHolderPresentation = (
    vcs: any | any[],
    nonce: string,
    audience: string,
    keyPair?: any
  ) => {
    const holderKeyPair = keyPair || KeyService.generateEcdsaKeyPair();
    const holderDid = `did:key:${holderKeyPair.publicKeyMultibase}`;
    const vcArray = Array.isArray(vcs) ? vcs : [vcs];
    const body = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiablePresentation"],
      id: `urn:uuid:${crypto.randomUUID()}`,
      holder: holderDid,
      verifiableCredential: vcArray,
    };
    const signedPayload = `${canonicalizeJson(body)}.${nonce}.${audience}`;

    return {
      presentation: {
        ...body,
        proof: {
          type: "JsonWebSignature2020",
          created: new Date().toISOString(),
          verificationMethod: `${holderDid}#key-1`,
          challenge: nonce,
          domain: audience,
          jws: KeyService.signData(holderKeyPair.privateKeyPem, signedPayload),
        },
      },
      holderDid,
      holderKeyPair,
    };
  };

  const testIfPostgres = (name: string, fn: () => Promise<void>) => {
    it(name, async (ctx: any) => {
      if (!isPostgresLive) {
        console.log(`[SKIPPED - BLOCKED]: ${name} (PostgreSQL daemon not running)`);
        ctx.skip();
        return;
      }
      await fn();
    });
  };

  beforeAll(async () => {
    const requirePostgres = process.env.REQUIRE_POSTGRES_INTEGRATION === "true";
    WalletCredentialRepository.resetTestDouble();

    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      isPostgresLive = true;
    } catch (err: any) {
      isPostgresLive = false;
      const diagMsg =
        "\n[POSTGRES WALLET OWNERSHIP SUITE DIAGNOSTIC]:\n" +
        "PostgreSQL database is NOT accessible on configured DATABASE_URL.\n" +
        `Error: ${err.message}\n` +
        "STATUS: BLOCKED — Local environment lacks Docker and local PostgreSQL daemon.\n" +
        "Live PostgreSQL wallet ownership tests will be skipped with status BLOCKED.\n";

      if (requirePostgres) {
        throw new Error(
          `FATAL: REQUIRE_POSTGRES_INTEGRATION is "true" but PostgreSQL connection failed: ${err.message}`
        );
      }
      console.warn(diagMsg);
    }

    if (isPostgresLive) {
      // 1. Ensure partial unique index exists in PostgreSQL test container
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "claim_invitations_one_consumed_owner_per_credential_uq"
        ON "claim_invitations" ("credentialId")
        WHERE "consumedAt" IS NOT NULL
          AND "claimedByUserId" IS NOT NULL;
      `);

      // 2. Verify partial unique index exists and is valid in PostgreSQL catalog
      const catalogCheck = await prisma.$queryRaw<any[]>`
        SELECT 
          i.indisunique,
          i.indisvalid,
          i.indisready,
          a.attname,
          pg_get_expr(i.indpred, i.indrelid) AS pred
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
        WHERE c.relname = 'claim_invitations_one_consumed_owner_per_credential_uq'
          AND t.relname = 'claim_invitations'
      `;
      if (!catalogCheck || catalogCheck.length === 0) {
        throw new Error("H1.3.3.1 index verification failed: partial unique index not found in pg_index");
      }
      if (!catalogCheck[0].indisunique || !catalogCheck[0].indisvalid || !catalogCheck[0].indisready) {
        throw new Error("H1.3.3.1 index verification failed: index is not unique, valid, or ready");
      }
      if (catalogCheck[0].attname !== "credentialId") {
        throw new Error(`H1.3.3.1 index verification failed: indexed column is ${catalogCheck[0].attname}, expected credentialId`);
      }

      const nowTs = Date.now();
      const tenantSlug = `pg-wallet-${nowTs}`;
      const tenant = await prisma.tenant.create({
        data: {
          slug: tenantSlug,
          name: "PostgreSQL Wallet University",
          legalEntityName: "PostgreSQL Wallet University Inc",
          websiteUrl: "https://pg-wallet.edu",
          didUri: `did:web:credvail.com:tenants:${tenantSlug}`,
        },
      });
      tenantId = tenant.id;

      // Foreign tenant for cross-tenant boundary verification
      const foreignTenant = await prisma.tenant.create({
        data: {
          slug: `pg-foreign-${nowTs}`,
          name: "Foreign University",
          legalEntityName: "Foreign University Inc",
          websiteUrl: "https://foreign.edu",
          didUri: `did:web:credvail.com:tenants:pg-foreign-${nowTs}`,
        },
      });
      foreignTenantId = foreignTenant.id;

      aliceEmail = `alice.${nowTs}@pg-wallet.edu`;
      const userAlice = await prisma.user.create({
        data: {
          email: aliceEmail,
          passwordHash: "argon2id_mock_hash_alice",
          fullName: "Alice Student H133",
          platformRole: "USER",
          emailVerifiedAt: new Date(),
        },
      });
      userIdAlice = userAlice.id;

      bobEmail = `bob.${nowTs}@pg-wallet.edu`;
      const userBob = await prisma.user.create({
        data: {
          email: bobEmail,
          passwordHash: "argon2id_mock_hash_bob",
          fullName: "Bob Student H133",
          platformRole: "USER",
          emailVerifiedAt: new Date(),
        },
      });
      userIdBob = userBob.id;

      aliceSessionToken = createSessionToken({
        id: userIdAlice,
        email: aliceEmail,
        fullName: "Alice Student H133",
        platformRole: "USER",
        emailVerified: true,
      });

      bobSessionToken = createSessionToken({
        id: userIdBob,
        email: bobEmail,
        fullName: "Bob Student H133",
        platformRole: "USER",
        emailVerified: true,
      });

      const recipientAlice = await prisma.recipient.create({
        data: {
          tenantId,
          fullName: "Alice Student H133",
          email: aliceEmail,
        },
      });
      recipientIdAlice = recipientAlice.id;

      const recipientBob = await prisma.recipient.create({
        data: {
          tenantId,
          fullName: "Bob Student H133",
          email: bobEmail,
        },
      });
      recipientIdBob = recipientBob.id;

      const recipientForeign = await prisma.recipient.create({
        data: {
          tenantId: foreignTenantId,
          fullName: "Foreign Student",
          email: `foreign.${nowTs}@foreign.edu`,
        },
      });
      recipientIdForeign = recipientForeign.id;

      const template = await prisma.certificateTemplate.create({
        data: {
          tenantId,
          title: "Wallet Resilience Degree",
          category: "DEGREE",
          dimensions: { width: 842, height: 595, unit: "pt" },
          layoutConfig: { orientation: "landscape" },
        },
      });
      templateId = template.id;

      issuerKeyPair = KeyService.generateEcdsaKeyPair();
      const key = await prisma.issuerKey.create({
        data: {
          tenantId,
          keyEpoch: 1,
          algorithm: "ECDSA_P256",
          publicKeyMultibase: issuerKeyPair.publicKeyMultibase,
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
          batchNumber: `BATCH-H133-${nowTs}`,
          status: "GENERATED",
        },
      });
      batchId = batch.id;

      // Seed Credential Alice
      const certNumAlice = `H133-CERT-ALICE-${nowTs}`;
      const credIdAlice = `urn:uuid:${crypto.randomUUID()}`;
      const rawVcAlice = VcService.buildUnsignedCredential({
        credentialId: credIdAlice,
        certificateNumber: certNumAlice,
        tenantDidUri: tenant.didUri,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        recipientId: recipientIdAlice,
        recipientName: "Alice Student H133",
        recipientEmail: aliceEmail,
        claims: { course_name: "PostgreSQL Concurrency Engineering", grade: "A" },
        batchId,
        merkleIndex: 0,
        bitstringIndex: 0,
      });
      signedVcAlice = VcService.signCredential(rawVcAlice, issuerKeyPair.privateKeyPem, key.keyIdentifier);

      credAlice = await prisma.credentialRecord.create({
        data: {
          credentialId: credIdAlice,
          certificateNumber: certNumAlice,
          tenantId,
          batchId,
          recipientId: recipientIdAlice,
          leafHash: "leaf_hash_alice",
          merkleIndex: 0,
          bitstringIndex: 0,
          state: "ISSUED",
          claimsData: { course_name: "PostgreSQL Concurrency Engineering", grade: "A" },
          vcPayloadJson: signedVcAlice as any,
        },
      });

      // Claimed invitation for Alice
      await prisma.claimInvitation.create({
        data: {
          tokenHash: crypto.createHash("sha256").update(`token_alice_${nowTs}`).digest("hex"),
          credentialId: credAlice.credentialId,
          certificateNumber: credAlice.certificateNumber,
          recipientEmail: aliceEmail,
          tenantId,
          expiresAt: new Date(Date.now() + 86400000),
          consumedAt: new Date(),
          claimedByUserId: userIdAlice,
          claimedByHolderDid: "did:key:alice_holder_did",
        },
      });

      // Seed Credential Bob
      const certNumBob = `H133-CERT-BOB-${nowTs}`;
      const credIdBob = `urn:uuid:${crypto.randomUUID()}`;
      const rawVcBob = VcService.buildUnsignedCredential({
        credentialId: credIdBob,
        certificateNumber: certNumBob,
        tenantDidUri: tenant.didUri,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        recipientId: recipientIdBob,
        recipientName: "Bob Student H133",
        recipientEmail: bobEmail,
        claims: { course_name: "PostgreSQL Concurrency Engineering", grade: "B" },
        batchId,
        merkleIndex: 1,
        bitstringIndex: 1,
      });
      signedVcBob = VcService.signCredential(rawVcBob, issuerKeyPair.privateKeyPem, key.keyIdentifier);

      credBob = await prisma.credentialRecord.create({
        data: {
          credentialId: credIdBob,
          certificateNumber: certNumBob,
          tenantId,
          batchId,
          recipientId: recipientIdBob,
          leafHash: "leaf_hash_bob",
          merkleIndex: 1,
          bitstringIndex: 1,
          state: "ISSUED",
          claimsData: { course_name: "PostgreSQL Concurrency Engineering", grade: "B" },
          vcPayloadJson: signedVcBob as any,
        },
      });

      // Claimed invitation for Bob
      await prisma.claimInvitation.create({
        data: {
          tokenHash: crypto.createHash("sha256").update(`token_bob_${nowTs}`).digest("hex"),
          credentialId: credBob.credentialId,
          certificateNumber: credBob.certificateNumber,
          recipientEmail: bobEmail,
          tenantId,
          expiresAt: new Date(Date.now() + 86400000),
          consumedAt: new Date(),
          claimedByUserId: userIdBob,
          claimedByHolderDid: "did:key:bob_holder_did",
        },
      });

      // Seed Unclaimed Credential
      const certNumUnclaimed = `H133-CERT-UNCLAIMED-${nowTs}`;
      const credIdUnclaimed = `urn:uuid:${crypto.randomUUID()}`;
      const rawVcUnclaimed = VcService.buildUnsignedCredential({
        credentialId: credIdUnclaimed,
        certificateNumber: certNumUnclaimed,
        tenantDidUri: tenant.didUri,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        recipientId: recipientIdAlice,
        recipientName: "Alice Student H133",
        recipientEmail: aliceEmail,
        claims: { course_name: "Unclaimed Architecture Course" },
        batchId,
        merkleIndex: 2,
        bitstringIndex: 2,
      });
      signedVcUnclaimed = VcService.signCredential(rawVcUnclaimed, issuerKeyPair.privateKeyPem, key.keyIdentifier);

      credUnclaimed = await prisma.credentialRecord.create({
        data: {
          credentialId: credIdUnclaimed,
          certificateNumber: certNumUnclaimed,
          tenantId,
          batchId,
          recipientId: recipientIdAlice,
          leafHash: "leaf_hash_unclaimed",
          merkleIndex: 2,
          bitstringIndex: 2,
          state: "ISSUED",
          claimsData: { course_name: "Unclaimed Architecture Course" },
          vcPayloadJson: signedVcUnclaimed as any,
        },
      });

      await prisma.claimInvitation.create({
        data: {
          tokenHash: crypto.createHash("sha256").update(`token_unclaimed_${nowTs}`).digest("hex"),
          credentialId: credUnclaimed.credentialId,
          certificateNumber: credUnclaimed.certificateNumber,
          recipientEmail: aliceEmail,
          tenantId,
          expiresAt: new Date(Date.now() + 86400000),
          consumedAt: null,
          claimedByUserId: null,
          claimedByHolderDid: null,
        },
      });

      // Seed Foreign Tenant Credential
      const foreignBatch = await prisma.issuanceBatch.create({
        data: {
          tenantId: foreignTenantId,
          templateId,
          issuerKeyId,
          batchNumber: `BATCH-FOREIGN-${nowTs}`,
          status: "GENERATED",
        },
      });

      const certNumForeign = `H133-CERT-FOREIGN-${nowTs}`;
      const credIdForeign = `urn:uuid:${crypto.randomUUID()}`;
      credForeignTenant = await prisma.credentialRecord.create({
        data: {
          credentialId: credIdForeign,
          certificateNumber: certNumForeign,
          tenantId: foreignTenantId,
          batchId: foreignBatch.id,
          recipientId: recipientIdForeign,
          leafHash: "leaf_hash_foreign",
          merkleIndex: 0,
          bitstringIndex: 0,
          state: "ISSUED",
          claimsData: { course_name: "Foreign Program" },
          vcPayloadJson: {} as any,
        },
      });

      await prisma.claimInvitation.create({
        data: {
          tokenHash: crypto.createHash("sha256").update(`token_foreign_${nowTs}`).digest("hex"),
          credentialId: credForeignTenant.credentialId,
          certificateNumber: credForeignTenant.certificateNumber,
          recipientEmail: "foreign@foreign.edu",
          tenantId: foreignTenantId,
          expiresAt: new Date(Date.now() + 86400000),
          consumedAt: new Date(),
          claimedByUserId: userIdAlice, // Alice maliciously linked to foreign tenant
        },
      });
    }
  });

  afterAll(async () => {
    WalletCredentialRepository.resetTestDouble();

    for (const client of testClients) {
      await client.$disconnect().catch(() => {});
    }

    if (isPostgresLive) {
      const cleanupErrors: any[] = [];
      try {
        const testUserIds = [userIdAlice, userIdBob].filter(Boolean);
        const testTenantIds = [tenantId, foreignTenantId].filter(Boolean);

        if (createdNonceHashes.length > 0) {
          await prisma.challengeNonce.deleteMany({
            where: { nonceHash: { in: createdNonceHashes } },
          }).catch((e) => cleanupErrors.push(e));
        }

        if (testTenantIds.length > 0) {
          await prisma.claimInvitation.deleteMany({
            where: { tenantId: { in: testTenantIds } },
          }).catch((e) => cleanupErrors.push(e));
        }

        if (testTenantIds.length > 0 || testUserIds.length > 0) {
          await prisma.auditLog.deleteMany({
            where: {
              OR: [
                ...(testTenantIds.length > 0 ? [{ tenantId: { in: testTenantIds } }] : []),
                ...(testUserIds.length > 0 ? [{ userId: { in: testUserIds } }] : []),
              ],
            },
          }).catch((e) => cleanupErrors.push(e));
        }

        if (testTenantIds.length > 0) {
          await prisma.credentialRecord.deleteMany({
            where: { tenantId: { in: testTenantIds } },
          }).catch((e) => cleanupErrors.push(e));

          await prisma.recipient.deleteMany({
            where: { tenantId: { in: testTenantIds } },
          }).catch((e) => cleanupErrors.push(e));

          await prisma.issuanceBatch.deleteMany({
            where: { tenantId: { in: testTenantIds } },
          }).catch((e) => cleanupErrors.push(e));

          await prisma.certificateTemplate.deleteMany({
            where: { tenantId: { in: testTenantIds } },
          }).catch((e) => cleanupErrors.push(e));

          await prisma.issuerKey.deleteMany({
            where: { tenantId: { in: testTenantIds } },
          }).catch((e) => cleanupErrors.push(e));
        }

        if (testUserIds.length > 0) {
          await prisma.tenantMembership.deleteMany({
            where: { userId: { in: testUserIds } },
          }).catch((e) => cleanupErrors.push(e));

          await prisma.user.deleteMany({
            where: { id: { in: testUserIds } },
          }).catch((e) => cleanupErrors.push(e));
        }

        if (testTenantIds.length > 0) {
          await prisma.tenant.deleteMany({
            where: { id: { in: testTenantIds } },
          }).catch((e) => cleanupErrors.push(e));
        }

        await prisma.$disconnect();

        if (cleanupErrors.length > 0) {
          throw new Error(`Teardown encountered ${cleanupErrors.length} cleanup errors: ${cleanupErrors.map(e => e.message).join("; ")}`);
        }
      } catch (err) {
        console.error("[PostgreSQL Teardown Failure]:", err);
        throw err;
      }
    }
  });

  // H133-01: Successful claimed credential remains retrievable after clearing process-local wallet cache
  testIfPostgres("H133-01: Successful claimed credential remains retrievable after clearing process-local wallet cache", async () => {
    WalletService.resetInMemoryStore();
    WalletCredentialRepository.resetTestDouble();

    const creds = await WalletCredentialRepository.listClaimedCredentials(userIdAlice);
    expect(creds.length).toBeGreaterThanOrEqual(1);

    const found = creds.find((c) => c.credentialId === credAlice.credentialId);
    expect(found).toBeDefined();
    expect(found?.certificateNumber).toBe(credAlice.certificateNumber);
    expect(found?.recipientName).toBe("Alice Student H133");
    expect(found?.recipientEmail).toBe(aliceEmail);
    expect(found?.courseName).toBe("PostgreSQL Concurrency Engineering");
    expect(found?.claimedByUserId).toBe(userIdAlice);
    expect(found?.claimedAt).toBeDefined();
  });

  // H133-02: Independent Prisma clients retrieve the same claimed credential
  testIfPostgres("H133-02: Independent Prisma clients retrieve the same claimed credential", async () => {
    const clientA = new PrismaClient();
    const clientB = new PrismaClient();
    testClients.push(clientA, clientB);

    const repoA = new PrismaWalletCredentialRepository(clientA);
    const repoB = new PrismaWalletCredentialRepository(clientB);

    const [resultsA, resultsB] = await Promise.all([
      repoA.listClaimedCredentials(userIdAlice),
      repoB.listClaimedCredentials(userIdAlice),
    ]);

    expect(resultsA.length).toBe(resultsB.length);
    expect(resultsA.map((c) => c.credentialId).sort()).toEqual(
      resultsB.map((c) => c.credentialId).sort()
    );
  });

  // H133-03: User A cannot list User B's claimed credentials
  testIfPostgres("H133-03: User A cannot list User B's claimed credentials", async () => {
    const aliceCreds = await WalletCredentialRepository.listClaimedCredentials(userIdAlice);
    const bobCreds = await WalletCredentialRepository.listClaimedCredentials(userIdBob);

    expect(aliceCreds.some((c) => c.credentialId === credBob.credentialId)).toBe(false);
    expect(bobCreds.some((c) => c.credentialId === credAlice.credentialId)).toBe(false);
    expect(bobCreds.some((c) => c.credentialId === credBob.credentialId)).toBe(true);
  });

  // H133-04: Unclaimed invitations and foreign tenant records are excluded
  testIfPostgres("H133-04: Unclaimed invitations and foreign tenant records are excluded", async () => {
    const creds = await WalletCredentialRepository.listClaimedCredentials(userIdAlice);

    // Unclaimed credential must be strictly excluded
    expect(creds.some((c) => c.credentialId === credUnclaimed.credentialId)).toBe(false);

    // Foreign tenant record with mismatched tenantId must be strictly excluded
    expect(creds.some((c) => c.credentialId === credForeignTenant.credentialId)).toBe(false);
  });

  // H133-05: Exact credential identifier and certificate-number ownership succeeds for the rightful claimant
  testIfPostgres("H133-05: Exact credential identifier and certificate-number ownership succeeds for the rightful claimant", async () => {
    // Both identifier and certificate number match
    const ownsExact = await WalletCredentialRepository.userOwnsCredential(
      userIdAlice,
      credAlice.credentialId,
      credAlice.certificateNumber
    );
    expect(ownsExact).toBe(true);

    // Credential ID alone
    const ownsById = await WalletCredentialRepository.userOwnsCredential(
      userIdAlice,
      credAlice.credentialId
    );
    expect(ownsById).toBe(true);

    // Certificate number alone
    const ownsByCert = await WalletCredentialRepository.userOwnsCredential(
      userIdAlice,
      undefined,
      credAlice.certificateNumber
    );
    expect(ownsByCert).toBe(true);
  });

  // H133-06: Mismatched certificate numbers and credential identifiers fail ownership
  testIfPostgres("H133-06: Mismatched certificate numbers and credential identifiers fail ownership", async () => {
    // Valid credentialId but mismatched certificateNumber must fail
    const mismatchCert = await WalletCredentialRepository.userOwnsCredential(
      userIdAlice,
      credAlice.credentialId,
      "H133-CERT-MISMATCHED-999"
    );
    expect(mismatchCert).toBe(false);

    // Valid certificateNumber but mismatched credentialId must fail
    const mismatchId = await WalletCredentialRepository.userOwnsCredential(
      userIdAlice,
      `urn:uuid:${crypto.randomUUID()}`,
      credAlice.certificateNumber
    );
    expect(mismatchId).toBe(false);

    // Rightful credential presented by wrong user must fail
    const wrongUser = await WalletCredentialRepository.userOwnsCredential(
      userIdBob,
      credAlice.credentialId,
      credAlice.certificateNumber
    );
    expect(wrongUser).toBe(false);
  });

  // H133-07: Empty in-memory wallet cannot bypass the presentation ownership check
  testIfPostgres("H133-07: Empty in-memory wallet cannot bypass the presentation ownership check", async () => {
    // Wipe all in-memory state completely
    WalletService.resetInMemoryStore();

    const challenge = await VerificationService.createChallengeNonce(300, defaultAudience);
    createdNonceHashes.push(hashNonce(challenge.nonce));

    // Alice attempts to present Bob's credential
    const { presentation } = createSignedHolderPresentation(
      signedVcBob,
      challenge.nonce,
      defaultAudience
    );

    const req = new NextRequest("http://localhost:3000/api/v1/wallet/present", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aliceSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        presentation,
        challengeNonce: challenge.nonce,
      }),
    });

    const res = await presentRoute(req);
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error).toBe("FORBIDDEN");
    expect(json.message).toContain("Ownership verification failed");
  });

  // H133-08: Two separate invitations for the same credential cannot establish two different owners, including concurrent redemption
  testIfPostgres("H133-08: Two separate invitations for the same credential cannot establish two different owners, including concurrent redemption", async () => {
    const nowTs = Date.now();
    const certNumRaced = `H133-CERT-RACED-${nowTs}`;
    const credIdRaced = `urn:uuid:${crypto.randomUUID()}`;

    // Seed shared credential
    const unsignedVcRaced = VcService.buildUnsignedCredential({
      credentialId: credIdRaced,
      certificateNumber: certNumRaced,
      tenantDidUri: `did:web:credvail.com:tenants:pg-wallet-${nowTs}`,
      tenantName: "PostgreSQL Wallet University",
      tenantSlug: `pg-wallet-${nowTs}`,
      recipientId: recipientIdAlice,
      recipientName: "Alice Student H133",
      recipientEmail: aliceEmail,
      claims: { course_name: "Single-Owner Concurrency" },
      batchId,
      merkleIndex: 4,
      bitstringIndex: 4,
    });
    const signedVcRaced = VcService.signCredential(
      unsignedVcRaced,
      issuerKeyPair.privateKeyPem,
      `${tenantId}#key-1`
    );

    await prisma.credentialRecord.create({
      data: {
        credentialId: credIdRaced,
        certificateNumber: certNumRaced,
        tenantId,
        batchId,
        recipientId: recipientIdAlice,
        leafHash: "leaf_hash_raced",
        merkleIndex: 4,
        bitstringIndex: 4,
        state: "ISSUED",
        claimsData: { course_name: "Single-Owner Concurrency" },
        vcPayloadJson: signedVcRaced as any,
      },
    });

    // Create Invitation A
    const { rawToken: tokenA } = await ClaimInvitationService.createInvitation({
      credentialId: credIdRaced,
      certificateNumber: certNumRaced,
      recipientEmail: aliceEmail,
      tenantId,
    });

    // Create Invitation B for the same credentialId and certificateNumber
    const { rawToken: tokenB } = await ClaimInvitationService.createInvitation({
      credentialId: credIdRaced,
      certificateNumber: certNumRaced,
      recipientEmail: bobEmail,
      tenantId,
    });

    // Alice and Bob race to claim the same credential concurrently
    const raceAlice = WalletService.claimCredential(
      {
        certificateNumber: certNumRaced,
        claimToken: tokenA,
        userEmail: aliceEmail,
        userId: userIdAlice,
        userEmailVerified: true,
      },
      userIdAlice
    );

    const raceBob = WalletService.claimCredential(
      {
        certificateNumber: certNumRaced,
        claimToken: tokenB,
        userEmail: bobEmail,
        userId: userIdBob,
        userEmailVerified: true,
      },
      userIdBob
    );

    const [outcomeA, outcomeB] = await Promise.allSettled([raceAlice, raceBob]);

    // Exactly one must succeed, and exactly one must fail with CREDENTIAL_ALREADY_CLAIMED
    const fulfilled = [outcomeA, outcomeB].filter((o) => o.status === "fulfilled");
    const rejected = [outcomeA, outcomeB].filter((o) => o.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason).toBeInstanceOf(CredentialAlreadyClaimedError);
    expect(rejectionReason.code).toBe("CREDENTIAL_ALREADY_CLAIMED");
    expect(rejectionReason.statusCode).toBe(409);

    // Database verification: Exactly ONE consumed owner record exists
    const consumedOwners = await prisma.claimInvitation.findMany({
      where: {
        credentialId: credIdRaced,
        consumedAt: { not: null },
        claimedByUserId: { not: null },
      },
    });
    expect(consumedOwners.length).toBe(1);

    // The losing invitation must remain UNCONSUMED with NULL claimedByUserId
    const unconsumedInvitations = await prisma.claimInvitation.findMany({
      where: {
        credentialId: credIdRaced,
        consumedAt: null,
      },
    });
    expect(unconsumedInvitations.length).toBe(1);
    expect(unconsumedInvitations[0].consumedAt).toBeNull();
    expect(unconsumedInvitations[0].claimedByUserId).toBeNull();

    // Verify ownership authority: Only the winning claimant owns the credential
    const winnerUserId = consumedOwners[0].claimedByUserId!;
    const loserUserId = winnerUserId === userIdAlice ? userIdBob : userIdAlice;

    const winnerOwns = await WalletCredentialRepository.userOwnsCredential(winnerUserId, credIdRaced);
    expect(winnerOwns).toBe(true);

    const loserOwns = await WalletCredentialRepository.userOwnsCredential(loserUserId, credIdRaced);
    expect(loserOwns).toBe(false);

    // Verify PostgreSQL catalog integrity for the partial unique index
    const indexCatalogRows = await prisma.$queryRaw<any[]>`
      SELECT 
        i.indisunique,
        i.indisvalid,
        i.indisready,
        a.attname,
        pg_get_expr(i.indpred, i.indrelid) AS pred
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
      WHERE c.relname = 'claim_invitations_one_consumed_owner_per_credential_uq'
        AND t.relname = 'claim_invitations'
    `;
    expect(indexCatalogRows.length).toBe(1);
    expect(indexCatalogRows[0].indisunique).toBe(true);
    expect(indexCatalogRows[0].indisvalid).toBe(true);
    expect(indexCatalogRows[0].indisready).toBe(true);
    expect(indexCatalogRows[0].attname).toBe("credentialId");
    const predStr = String(indexCatalogRows[0].pred || "");
    expect(predStr).toContain("consumedAt IS NOT NULL");
    expect(predStr).toContain("claimedByUserId IS NOT NULL");

    // Verify an unrelated unique-constraint violation (duplicate tokenHash) is NOT mapped to CredentialAlreadyClaimedError
    let unrelatedViolationError: any = null;
    try {
      const existingTokenHash = (await prisma.claimInvitation.findFirstOrThrow()).tokenHash;
      await prisma.claimInvitation.create({
        data: {
          tokenHash: existingTokenHash,
          credentialId: `urn:uuid:${crypto.randomUUID()}`,
          certificateNumber: `UNRELATED-UNIQUE-${nowTs}`,
          recipientEmail: "unrelated@test.edu",
          tenantId,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
    } catch (err: any) {
      unrelatedViolationError = err;
    }
    expect(unrelatedViolationError).toBeDefined();
    expect(unrelatedViolationError).not.toBeInstanceOf(CredentialAlreadyClaimedError);

    // Verify alternate claim API (consumeAtomic) cannot bypass the single-owner invariant
    let consumeAtomicError: any = null;
    try {
      await ClaimInvitationRepository.consumeAtomic(
        unconsumedInvitations[0].id,
        loserUserId
      );
    } catch (err: any) {
      consumeAtomicError = err;
    }
    expect(consumeAtomicError).toBeInstanceOf(CredentialAlreadyClaimedError);
  });

  // H133-09: GET wallet API ignores arbitrary caller-supplied userId and holderId parameters
  testIfPostgres("H133-09: GET wallet API ignores arbitrary caller-supplied userId and holderId parameters", async () => {
    const maliciousUrl = `http://localhost:3000/api/v1/wallet/credentials?userId=${userIdBob}&holderId=${userIdBob}`;
    const req = new NextRequest(maliciousUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${aliceSessionToken}`,
      },
    });

    const res = await getCredentialsRoute(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    // Authenticated session.sub takes absolute precedence
    expect(json.data.holder.holderId).toBe(userIdAlice);

    // Returned credentials must belong to Alice, never Bob
    expect(json.data.credentials.some((c: any) => c.credentialId === credAlice.credentialId)).toBe(true);
    expect(json.data.credentials.some((c: any) => c.credentialId === credBob.credentialId)).toBe(false);

    // Verify response does not leak internal SQL or database error structures
    expect(JSON.stringify(json)).not.toContain("prisma");
    expect(JSON.stringify(json)).not.toContain("P2002");
  });

  // H133-10: Presentation endpoint rejects all foreign or unclaimed embedded credentials before challenge verification; verifier nonce stays unconsumed
  testIfPostgres("H133-10: Presentation endpoint rejects all foreign or unclaimed embedded credentials before challenge verification; verifier nonce stays unconsumed", async () => {
    const challenge = await VerificationService.createChallengeNonce(300, defaultAudience);
    const nHash = hashNonce(challenge.nonce);
    createdNonceHashes.push(nHash);

    // Scenario A: Attacker presents foreign credential owned by Bob
    const { presentation: vpForeign } = createSignedHolderPresentation(
      signedVcBob,
      challenge.nonce,
      defaultAudience
    );
    const reqForeign = new NextRequest("http://localhost:3000/api/v1/wallet/present", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aliceSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ presentation: vpForeign, challengeNonce: challenge.nonce }),
    });
    const resForeign = await presentRoute(reqForeign);
    expect(resForeign.status).toBe(403);

    // Scenario B: Attacker presents unclaimed credential
    const { presentation: vpUnclaimed } = createSignedHolderPresentation(
      signedVcUnclaimed,
      challenge.nonce,
      defaultAudience
    );
    const reqUnclaimed = new NextRequest("http://localhost:3000/api/v1/wallet/present", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aliceSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ presentation: vpUnclaimed, challengeNonce: challenge.nonce }),
    });
    const resUnclaimed = await presentRoute(reqUnclaimed);
    expect(resUnclaimed.status).toBe(403);

    // Scenario C: Mixed presentation containing both a valid owned credential AND an unowned foreign credential
    const { presentation: vpMixed } = createSignedHolderPresentation(
      [signedVcAlice, signedVcBob],
      challenge.nonce,
      defaultAudience
    );
    const reqMixed = new NextRequest("http://localhost:3000/api/v1/wallet/present", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aliceSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ presentation: vpMixed, challengeNonce: challenge.nonce }),
    });
    const resMixed = await presentRoute(reqMixed);
    expect(resMixed.status).toBe(403);

    // VERIFY REPLAY DEFENSE INTEGRITY:
    // The challenge nonce in PostgreSQL must remain UNCONSUMED across all rejected presentation attempts!
    const nonceRow = await prisma.challengeNonce.findUnique({
      where: { nonceHash: nHash },
    });
    expect(nonceRow).toBeDefined();
    expect(nonceRow?.consumedAt).toBeNull();
  });

  // H133-11: Legitimate claimant can retrieve and authorize a presentation after cache clearing and independent-client access
  testIfPostgres("H133-11: Legitimate claimant can retrieve and authorize a presentation after cache clearing and independent-client access", async () => {
    // 1. Wipe process cache
    WalletService.resetInMemoryStore();

    // 2. Read through fresh independent client
    const freshClient = new PrismaClient();
    testClients.push(freshClient);
    const freshRepo = new PrismaWalletCredentialRepository(freshClient);
    const aliceWallet = await freshRepo.listClaimedCredentials(userIdAlice);
    expect(aliceWallet.some((c) => c.credentialId === credAlice.credentialId)).toBe(true);

    // 3. Obtain fresh challenge nonce
    const challenge = await VerificationService.createChallengeNonce(300, defaultAudience);
    const nHash = hashNonce(challenge.nonce);
    createdNonceHashes.push(nHash);

    // 4. Client signs presentation
    const { presentation } = createSignedHolderPresentation(
      signedVcAlice,
      challenge.nonce,
      defaultAudience
    );

    // 5. Present credential to API
    const req = new NextRequest("http://localhost:3000/api/v1/wallet/present", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aliceSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        presentation,
        challengeNonce: challenge.nonce,
      }),
    });

    const res = await presentRoute(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.verificationResult.isValid).toBe(true);

    // 6. Confirm challenge nonce was atomically consumed in PostgreSQL
    const consumedNonce = await prisma.challengeNonce.findUnique({
      where: { nonceHash: nHash },
    });
    expect(consumedNonce?.consumedAt).not.toBeNull();
  });

  // H133-12: Database outage produces sanitized HTTP 503 behavior for wallet retrieval and presentation ownership
  testIfPostgres("H133-12: Database outage produces sanitized HTTP 503 behavior for wallet retrieval and presentation ownership", async () => {
    const challenge = await VerificationService.createChallengeNonce(300, defaultAudience);
    const nHash = hashNonce(challenge.nonce);
    createdNonceHashes.push(nHash);

    const failingRepo: IWalletCredentialRepository = {
      async listClaimedCredentials() {
        throw new WalletStorageUnavailableError("Simulated database cluster outage");
      },
      async userOwnsCredential() {
        throw new WalletStorageUnavailableError("Simulated database cluster outage");
      },
    };

    WalletCredentialRepository.setTestDouble(failingRepo);

    try {
      // 1. GET wallet credentials fails closed with HTTP 503
      const getReq = new NextRequest("http://localhost:3000/api/v1/wallet/credentials", {
        method: "GET",
        headers: { Authorization: `Bearer ${aliceSessionToken}` },
      });
      const getRes = await getCredentialsRoute(getReq);
      expect(getRes.status).toBe(503);
      const getJson = await getRes.json();
      expect(getJson.error).toBe("SERVICE_UNAVAILABLE");
      expect(getJson.code).toBe("WALLET_STORAGE_UNAVAILABLE");

      // 2. POST wallet present fails closed with HTTP 503
      const { presentation } = createSignedHolderPresentation(
        signedVcAlice,
        challenge.nonce,
        defaultAudience
      );
      const presentReq = new NextRequest("http://localhost:3000/api/v1/wallet/present", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${aliceSessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ presentation, challengeNonce: challenge.nonce }),
      });
      const presentRes = await presentRoute(presentReq);
      expect(presentRes.status).toBe(503);
      const presentJson = await presentRes.json();
      expect(presentJson.error).toBe("SERVICE_UNAVAILABLE");
      expect(presentJson.code).toBe("WALLET_STORAGE_UNAVAILABLE");

      // Verify sanitized responses leak no raw database diagnostics
      expect(JSON.stringify(getJson)).not.toContain("prisma");
      expect(JSON.stringify(getJson)).not.toContain("P2002");
      expect(JSON.stringify(presentJson)).not.toContain("prisma");
      expect(JSON.stringify(presentJson)).not.toContain("P2002");

      // 3. Crucial: Challenge nonce was NOT consumed
      const nonceRow = await prisma.challengeNonce.findUnique({
        where: { nonceHash: nHash },
      });
      expect(nonceRow?.consumedAt).toBeNull();
    } finally {
      WalletCredentialRepository.resetTestDouble();
    }
  });
});
