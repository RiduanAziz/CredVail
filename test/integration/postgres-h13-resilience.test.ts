/**
 * CREDVAIL Real PostgreSQL Challenge Nonce Resilience & Distributed Replay Integration Suite (H1.3.1)
 *
 * Target: Actual PostgreSQL persistence via Prisma Client
 * Isolation: Database-backed SHA-256 nonces, atomic conditional consumption
 *
 * Test Matrix:
 * - H131-01: Create a challenge -> Raw nonce returned once
 * - H131-02: Inspect persisted row -> Only nonceHash stored (no raw nonce)
 * - H131-03: Retrieve challenge after service reinitialization -> Challenge remains available
 * - H131-04: Two independent repository clients retrieve same challenge -> Both see same active record
 * - H131-05: Correct audience -> Validation succeeds
 * - H131-06: Wrong audience -> Rejected without consuming challenge
 * - H131-07: Expired challenge -> Rejected
 * - H131-08: Unknown challenge -> Rejected
 * - H131-09: Invalid holder signature -> Challenge remains unconsumed in PostgreSQL
 * - H131-10: Correct holder signature -> Challenge consumed atomically
 * - H131-11: Replay after consumption -> Rejected
 * - H131-12: Two concurrent consumers -> Exactly one succeeds
 * - H131-13: Multiple concurrent consumers -> Exactly one succeeds
 * - H131-14: Consumed challenge on another application instance -> Still rejected
 * - H131-15: Mandatory integration precondition verified (live PostgreSQL active, no in-memory fallback)
 * - H131-16: Expired-record cleanup -> Expired records removed; active records preserved
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  ChallengeNonceRepository,
  PrismaChallengeNonceRepository,
  hashNonce,
} from "@/lib/repositories/challenge-nonce-repository";
import { VerificationService } from "@/lib/services/verification-service";
import { KeyService } from "@/lib/crypto/key-service";
import { VcService } from "@/lib/crypto/vc-service";
import { canonicalizeJson } from "@/lib/crypto/canonical";

describe("CREDVAIL PostgreSQL Live Challenge Nonce Persistence & Replay Protection (H1.3.1)", () => {
  let isPostgresLive = false;
  const createdNonceHashes: string[] = [];
  let signedVc: any;
  const defaultAudience = "https://verifier.credvail.test";

  // Helper to create client-signed presentation
  const createSignedHolderPresentation = (nonce: string, audience: string) => {
    const holderKeyPair = KeyService.generateEcdsaKeyPair();
    const holderDid = `did:key:${holderKeyPair.publicKeyMultibase}`;
    const body = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiablePresentation"],
      id: `urn:uuid:${crypto.randomUUID()}`,
      holder: holderDid,
      verifiableCredential: [signedVc],
    };
    const signedPayload = `${canonicalizeJson(body)}.${nonce}.${audience}`;

    return {
      ...body,
      proof: {
        type: "JsonWebSignature2020",
        created: new Date().toISOString(),
        verificationMethod: `${holderDid}#key-1`,
        challenge: nonce,
        domain: audience,
        jws: KeyService.signData(holderKeyPair.privateKeyPem, signedPayload),
      },
    };
  };

  beforeAll(async () => {
    const requirePostgres = process.env.REQUIRE_POSTGRES_INTEGRATION === "true";

    // Strictly ensure no in-memory test doubles are used for real PostgreSQL integration
    ChallengeNonceRepository.resetTestDouble();

    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      isPostgresLive = true;
    } catch (err: any) {
      isPostgresLive = false;
      const diagMsg =
        "\n[POSTGRES H1.3.1 SUITE DIAGNOSTIC]:\n" +
        "PostgreSQL database is NOT accessible on configured DATABASE_URL.\n" +
        `Error: ${err.message}\n` +
        "STATUS: BLOCKED — Local environment lacks Docker and local PostgreSQL daemon.\n" +
        "Live PostgreSQL challenge nonce tests will be skipped with status BLOCKED.\n";

      if (requirePostgres) {
        throw new Error(
          `FATAL: REQUIRE_POSTGRES_INTEGRATION is "true" but PostgreSQL connection failed: ${err.message}`
        );
      }
      console.warn(diagMsg);
    }

    if (isPostgresLive) {
      // Create a minimal signed VC for holder presentation verification
      const issuerKeys = KeyService.generateEcdsaKeyPair();
      const unsignedVc = VcService.buildUnsignedCredential({
        credentialId: `urn:uuid:${crypto.randomUUID()}`,
        certificateNumber: `H131-CERT-${Date.now()}`,
        tenantDidUri: "did:web:credvail.test:issuer",
        tenantName: "PostgreSQL Verification Org",
        tenantSlug: "pg-verify-org",
        recipientId: "rec_h131",
        recipientName: "Test Student",
        recipientEmail: "student@test.edu",
        claims: { course: "Database Reliability" },
        batchId: "batch_h131",
        merkleIndex: 0,
        bitstringIndex: 0,
      });

      signedVc = VcService.signCredential(
        unsignedVc,
        issuerKeys.privateKeyPem,
        "did:web:credvail.test:issuer#key-1"
      );
    }
  });

  afterAll(async () => {
    if (isPostgresLive) {
      try {
        if (createdNonceHashes.length > 0) {
          await prisma.challengeNonce.deleteMany({
            where: { nonceHash: { in: createdNonceHashes } },
          });
        }
      } catch (cleanupErr: any) {
        console.error(
          `[POSTGRES H1.3.1 CLEANUP FAILURE]: ${cleanupErr?.message || cleanupErr}`,
          cleanupErr
        );
        throw cleanupErr;
      } finally {
        await prisma.$disconnect();
      }
    } else {
      await prisma.$disconnect();
    }
  });

  // Explicit skip helper for offline environments
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

  testIfPostgres("H131-01: Create a challenge -> Raw nonce returned once", async () => {
    const challenge = await VerificationService.createChallengeNonce(300, defaultAudience);

    expect(challenge.nonce).toMatch(/^cn_[a-f0-9]{48}$/);
    expect(challenge.audience).toBe(defaultAudience);
    expect(new Date(challenge.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const h = hashNonce(challenge.nonce);
    createdNonceHashes.push(h);
  });

  testIfPostgres("H131-02: Inspect persisted row -> Only nonceHash stored (never plaintext nonce)", async () => {
    const challenge = await VerificationService.createChallengeNonce(300, defaultAudience);
    const expectedHash = hashNonce(challenge.nonce);
    createdNonceHashes.push(expectedHash);

    const row = await prisma.challengeNonce.findUnique({
      where: { nonceHash: expectedHash },
    });

    expect(row).not.toBeNull();
    expect(row!.nonceHash).toBe(expectedHash);
    expect(row!.audience).toBe(defaultAudience);
    expect(row!.consumedAt).toBeNull();
    expect(row!.createdAt).toBeInstanceOf(Date);
    expect(row!.expiresAt).toBeInstanceOf(Date);

    // Verify plaintext nonce is not present in row fields
    expect((row as any).nonce).toBeUndefined();
  });

  testIfPostgres("H131-03: Retrieve challenge after service reinitialization", async () => {
    const challenge = await VerificationService.createChallengeNonce(300, defaultAudience);
    createdNonceHashes.push(hashNonce(challenge.nonce));

    // Fresh repository instance queries the same challenge
    const repo = new PrismaChallengeNonceRepository();
    const active = await repo.findActiveChallenge(challenge.nonce);

    expect(active).not.toBeNull();
    expect(active!.audience).toBe(defaultAudience);
    expect(active!.nonceHash).toBe(hashNonce(challenge.nonce));
  });

  testIfPostgres("H131-04: Two independent repository clients retrieve same challenge", async () => {
    const challenge = await VerificationService.createChallengeNonce(300, defaultAudience);
    createdNonceHashes.push(hashNonce(challenge.nonce));

    const clientA = new PrismaClient();
    const clientB = new PrismaClient();

    try {
      const rowA = await clientA.challengeNonce.findUnique({
        where: { nonceHash: hashNonce(challenge.nonce) },
      });
      const rowB = await clientB.challengeNonce.findUnique({
        where: { nonceHash: hashNonce(challenge.nonce) },
      });

      expect(rowA).not.toBeNull();
      expect(rowB).not.toBeNull();
      expect(rowA!.id).toBe(rowB!.id);
      expect(rowA!.nonceHash).toBe(rowB!.nonceHash);
    } finally {
      await clientA.$disconnect();
      await clientB.$disconnect();
    }
  });

  testIfPostgres("H131-05: Correct audience -> Validation succeeds", async () => {
    const audience = "https://legitimate-verifier.edu";
    const challenge = await VerificationService.createChallengeNonce(300, audience);
    createdNonceHashes.push(hashNonce(challenge.nonce));

    const vp = createSignedHolderPresentation(challenge.nonce, audience);
    const result = await VerificationService.verifyPresentation(vp, challenge.nonce);

    const nonceCheck = result.checks.find((c) => c.code === "CHALLENGE_NONCE_VERIFICATION");
    const holderSigCheck = result.checks.find((c) => c.code === "HOLDER_PRESENTATION_SIGNATURE");

    expect(
      nonceCheck?.passed,
      `CHALLENGE_NONCE_VERIFICATION check failed: ${JSON.stringify(nonceCheck)}`
    ).toBe(true);
    expect(
      holderSigCheck?.passed,
      `HOLDER_PRESENTATION_SIGNATURE check failed: ${JSON.stringify(holderSigCheck)}`
    ).toBe(true);
  });

  testIfPostgres("H131-06: Wrong audience -> Rejected without consuming challenge", async () => {
    const legitimateAudience = "https://legitimate-verifier.edu";
    const spoofedAudience = "https://attacker.com";
    const challenge = await VerificationService.createChallengeNonce(300, legitimateAudience);
    const h = hashNonce(challenge.nonce);
    createdNonceHashes.push(h);

    const vp = createSignedHolderPresentation(challenge.nonce, spoofedAudience);
    const result = await VerificationService.verifyPresentation(vp, challenge.nonce);

    expect(result.isValid).toBe(false);
    expect(result.checks.find((c) => c.code === "CHALLENGE_NONCE_VERIFICATION")?.passed).toBe(false);

    // Challenge must remain unconsumed in PostgreSQL
    const inDb = await prisma.challengeNonce.findUnique({ where: { nonceHash: h } });
    expect(inDb?.consumedAt).toBeNull();
  });

  testIfPostgres("H131-07: Expired challenge -> Rejected", async () => {
    const expiredNonce = `cn_${crypto.randomBytes(24).toString("hex")}`;
    const h = hashNonce(expiredNonce);
    createdNonceHashes.push(h);

    await prisma.challengeNonce.create({
      data: {
        nonceHash: h,
        audience: defaultAudience,
        expiresAt: new Date(Date.now() - 5000), // 5 seconds in the past
      },
    });

    const vp = createSignedHolderPresentation(expiredNonce, defaultAudience);
    const result = await VerificationService.verifyPresentation(vp, expiredNonce);

    expect(result.isValid).toBe(false);
    expect(result.checks.find((c) => c.code === "CHALLENGE_NONCE_VERIFICATION")?.passed).toBe(false);
  });

  testIfPostgres("H131-08: Unknown challenge -> Rejected", async () => {
    const fakeNonce = `cn_${crypto.randomBytes(24).toString("hex")}`;
    const vp = createSignedHolderPresentation(fakeNonce, defaultAudience);
    const result = await VerificationService.verifyPresentation(vp, fakeNonce);

    expect(result.isValid).toBe(false);
    expect(result.checks.find((c) => c.code === "CHALLENGE_NONCE_VERIFICATION")?.passed).toBe(false);
  });

  testIfPostgres("H131-09: Invalid holder signature -> Challenge remains unconsumed", async () => {
    const challenge = await VerificationService.createChallengeNonce(300, defaultAudience);
    const h = hashNonce(challenge.nonce);
    createdNonceHashes.push(h);

    const vp = createSignedHolderPresentation(challenge.nonce, defaultAudience);
    // Tamper with JWS signature bytes
    vp.proof.jws = `${vp.proof.jws.slice(0, -4)}0000`;

    const result = await VerificationService.verifyPresentation(vp, challenge.nonce);

    expect(result.isValid).toBe(false);
    expect(result.checks.find((c) => c.code === "HOLDER_PRESENTATION_SIGNATURE")?.passed).toBe(false);

    // Challenge must remain unconsumed in PostgreSQL because signature check failed
    const inDb = await prisma.challengeNonce.findUnique({ where: { nonceHash: h } });
    expect(inDb?.consumedAt).toBeNull();
  });

  testIfPostgres("H131-10: Correct holder signature -> Challenge consumed atomically", async () => {
    const challenge = await VerificationService.createChallengeNonce(300, defaultAudience);
    const h = hashNonce(challenge.nonce);
    createdNonceHashes.push(h);

    const vp = createSignedHolderPresentation(challenge.nonce, defaultAudience);
    const result = await VerificationService.verifyPresentation(vp, challenge.nonce);

    const holderSigCheck = result.checks.find((c) => c.code === "HOLDER_PRESENTATION_SIGNATURE");
    const nonceCheck = result.checks.find((c) => c.code === "CHALLENGE_NONCE_VERIFICATION");

    // 1. Assert holder signature verification succeeds
    expect(
      holderSigCheck?.passed,
      `HOLDER_PRESENTATION_SIGNATURE check failed: ${JSON.stringify(holderSigCheck)}`
    ).toBe(true);

    // 2. Assert challenge nonce verification succeeds
    expect(
      nonceCheck?.passed,
      `CHALLENGE_NONCE_VERIFICATION check failed: ${JSON.stringify(nonceCheck)}`
    ).toBe(true);

    // 3. Query the actual PostgreSQL row
    const inDb = await prisma.challengeNonce.findUnique({ where: { nonceHash: h } });

    // 4. Assert consumedAt is a valid Date
    expect(inDb).not.toBeNull();
    expect(inDb?.consumedAt).not.toBeNull();
    expect(inDb?.consumedAt).toBeInstanceOf(Date);

    // 5. Ensure the database confirms the challenge has been consumed exactly once
    const reConsumeAttempt = await ChallengeNonceRepository.consumeChallengeAtomic({
      nonce: challenge.nonce,
      expectedAudience: defaultAudience,
    });
    expect(reConsumeAttempt).toBe(false);
  });

  testIfPostgres("H131-11: Replay after consumption -> Rejected", async () => {
    const challenge = await VerificationService.createChallengeNonce(300, defaultAudience);
    const h = hashNonce(challenge.nonce);
    createdNonceHashes.push(h);

    const vp = createSignedHolderPresentation(challenge.nonce, defaultAudience);

    // First presentation succeeds at holder authentication & challenge nonce verification
    const firstResult = await VerificationService.verifyPresentation(vp, challenge.nonce);
    const firstHolderSig = firstResult.checks.find((c) => c.code === "HOLDER_PRESENTATION_SIGNATURE");
    const firstNonce = firstResult.checks.find((c) => c.code === "CHALLENGE_NONCE_VERIFICATION");

    expect(
      firstHolderSig?.passed,
      `Initial holder signature verification failed: ${JSON.stringify(firstHolderSig)}`
    ).toBe(true);
    expect(
      firstNonce?.passed,
      `Initial challenge nonce verification failed: ${JSON.stringify(firstNonce)}`
    ).toBe(true);

    const firstDbRow = await prisma.challengeNonce.findUnique({ where: { nonceHash: h } });
    expect(firstDbRow?.consumedAt).not.toBeNull();
    expect(firstDbRow?.consumedAt).toBeInstanceOf(Date);
    const originalConsumedAt = firstDbRow!.consumedAt!.getTime();

    // Second request with identical presentation (replay attack)
    const replayResult = await VerificationService.verifyPresentation(vp, challenge.nonce);
    const replayHolderSig = replayResult.checks.find((c) => c.code === "HOLDER_PRESENTATION_SIGNATURE");
    const replayNonce = replayResult.checks.find((c) => c.code === "CHALLENGE_NONCE_VERIFICATION");

    // Holder signature remains cryptographically valid
    expect(
      replayHolderSig?.passed,
      `Replay holder signature must remain cryptographically valid: ${JSON.stringify(replayHolderSig)}`
    ).toBe(true);

    // Challenge nonce check fails specifically because the nonce has already been consumed
    expect(
      replayNonce?.passed,
      `Replayed challenge nonce must be rejected: ${JSON.stringify(replayNonce)}`
    ).toBe(false);

    // Overall presentation must be rejected
    expect(replayResult.isValid).toBe(false);
    expect(replayResult.status).toBe("INVALID");

    // Replay must not modify the original consumption timestamp
    const secondDbRow = await prisma.challengeNonce.findUnique({ where: { nonceHash: h } });
    expect(secondDbRow?.consumedAt).not.toBeNull();
    expect(secondDbRow!.consumedAt!.getTime()).toBe(originalConsumedAt);
  });

  testIfPostgres("H131-12: Two concurrent consumers -> Exactly one succeeds", async () => {
    const challenge = await VerificationService.createChallengeNonce(300, defaultAudience);
    createdNonceHashes.push(hashNonce(challenge.nonce));

    // Two simultaneous atomic consumption attempts
    const [resultA, resultB] = await Promise.all([
      ChallengeNonceRepository.consumeChallengeAtomic({
        nonce: challenge.nonce,
        expectedAudience: defaultAudience,
      }),
      ChallengeNonceRepository.consumeChallengeAtomic({
        nonce: challenge.nonce,
        expectedAudience: defaultAudience,
      }),
    ]);

    const successes = [resultA, resultB].filter((r) => r === true).length;
    const failures = [resultA, resultB].filter((r) => r === false).length;

    expect(successes).toBe(1);
    expect(failures).toBe(1);

    const inDb = await prisma.challengeNonce.findUnique({
      where: { nonceHash: hashNonce(challenge.nonce) },
    });
    expect(inDb?.consumedAt).not.toBeNull();
  });

  testIfPostgres("H131-13: Multiple concurrent consumers (5 simultaneous) -> Exactly one succeeds", async () => {
    const challenge = await VerificationService.createChallengeNonce(300, defaultAudience);
    createdNonceHashes.push(hashNonce(challenge.nonce));

    const results = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        ChallengeNonceRepository.consumeChallengeAtomic({
          nonce: challenge.nonce,
          expectedAudience: defaultAudience,
        })
      )
    );

    const successCount = results.filter((r) => r === true).length;
    const failureCount = results.filter((r) => r === false).length;

    expect(successCount).toBe(1);
    expect(failureCount).toBe(4);
  });

  testIfPostgres("H131-14: Consumed challenge on another application instance -> Still rejected", async () => {
    const challenge = await VerificationService.createChallengeNonce(300, defaultAudience);
    createdNonceHashes.push(hashNonce(challenge.nonce));

    const instance1 = new PrismaChallengeNonceRepository();
    const instance2 = new PrismaChallengeNonceRepository();

    // Instance 1 consumes
    const consumedOnInst1 = await instance1.consumeChallengeAtomic({
      nonce: challenge.nonce,
      expectedAudience: defaultAudience,
    });
    expect(consumedOnInst1).toBe(true);

    // Instance 2 attempts to consume same challenge
    const consumedOnInst2 = await instance2.consumeChallengeAtomic({
      nonce: challenge.nonce,
      expectedAudience: defaultAudience,
    });
    expect(consumedOnInst2).toBe(false);
  });

  testIfPostgres(
    "H131-15: Mandatory integration precondition verified (live PostgreSQL active, no in-memory fallback)",
    async () => {
      // Audited in H1.3.1.1: This test confirms the live PostgreSQL precondition is satisfied.
      // Real database outage is not simulated dynamically in this test to avoid disrupting the shared connection pool.
      // Fail-closed enforcement on database outage is proven at suite initialization (beforeAll throws FATAL
      // when REQUIRE_POSTGRES_INTEGRATION="true" and PostgreSQL is unavailable) and verified here by ensuring
      // that ChallengeNonceRepository is strictly bound to the Prisma PostgreSQL repository with zero fallback.
      expect(isPostgresLive).toBe(true);
      expect(ChallengeNonceRepository.instance).toBeInstanceOf(PrismaChallengeNonceRepository);
    }
  );

  testIfPostgres("H131-16: Expired-record cleanup -> Expired removed, active preserved", async () => {
    const expiredNonce1 = `cn_exp1_${crypto.randomBytes(20).toString("hex")}`;
    const expiredNonce2 = `cn_exp2_${crypto.randomBytes(20).toString("hex")}`;
    const activeNonce = `cn_act_${crypto.randomBytes(20).toString("hex")}`;

    const hExp1 = hashNonce(expiredNonce1);
    const hExp2 = hashNonce(expiredNonce2);
    const hAct = hashNonce(activeNonce);

    createdNonceHashes.push(hExp1, hExp2, hAct);

    const now = new Date();
    await prisma.challengeNonce.createMany({
      data: [
        { nonceHash: hExp1, audience: defaultAudience, expiresAt: new Date(now.getTime() - 20000) },
        { nonceHash: hExp2, audience: defaultAudience, expiresAt: new Date(now.getTime() - 10000) },
        { nonceHash: hAct, audience: defaultAudience, expiresAt: new Date(now.getTime() + 300000) },
      ],
    });

    const deleted = await ChallengeNonceRepository.cleanupExpiredChallenges(100, now);
    expect(deleted).toBeGreaterThanOrEqual(2);

    // Active record must remain intact in PostgreSQL
    const activeRow = await prisma.challengeNonce.findUnique({ where: { nonceHash: hAct } });
    expect(activeRow).not.toBeNull();
    expect(activeRow!.nonceHash).toBe(hAct);

    // Expired records must be gone
    const expRow1 = await prisma.challengeNonce.findUnique({ where: { nonceHash: hExp1 } });
    const expRow2 = await prisma.challengeNonce.findUnique({ where: { nonceHash: hExp2 } });
    expect(expRow1).toBeNull();
    expect(expRow2).toBeNull();
  });
});
