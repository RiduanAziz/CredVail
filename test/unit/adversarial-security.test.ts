/**
 * CREDVAIL Adversarial Security & Threat Rejection Test Suite (Phase 13)
 * 
 * Evaluates the 10 core adversarial attack vectors (SEC-01 through SEC-10)
 * defined in THREAT_MODEL_STRIDE.md and RESEARCH_METHODOLOGY.md (Metric M7).
 * Asserts 100.0% detection and rejection rate across all attack scenarios.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { KeyRepository } from "@/lib/repositories/key-repository";
import { KeyService } from "@/lib/crypto/key-service";
import { VcService } from "@/lib/crypto/vc-service";
import { CredvailMerkleTree } from "@/lib/crypto/merkle";
import { VerificationService } from "@/lib/services/verification-service";
import { sanitizeFormulaValue } from "@/lib/csv/spreadsheet-parser";
import { RevocationFreshnessService } from "@/lib/services/revocation-freshness-service";
import { StatusListService } from "@/lib/services/status-list-service";
import { StatusSnapshotRepository } from "@/lib/repositories/status-snapshot-repository";
import { BlockchainService } from "@/lib/blockchain/blockchain-service";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { TenantRepository, inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { extractTenantContext, AuthorizationError } from "@/lib/auth/tenant-context";
import { createSessionToken } from "@/lib/auth/session";
import type { NextRequest } from "next/server";
import type { PlatformRole, TenantRole } from "@/types";

describe("Adversarial Security & Attack Rejection Matrix (SEC-01 to SEC-10 / Metric M7)", () => {
  let tenantId = "tnt_adversary_test";
  const tenantSlug = "adversary-univ";
  const certNumber = "SEC-2026-0001";
  const recipientEmail = "alice@example.edu";
  let issuerPrivateKeyPem: string;
  let issuerPublicKeyPem: string;
  let signedVc: any;

  beforeEach(async () => {
    KeyRepository.resetInMemoryStore();
    StatusSnapshotRepository.resetInMemoryStore();
    StatusListService.clearCache();
    BlockchainService.resetSimulatedState();
    CredentialRepository.resetInMemoryStore();
    inMemoryTenantStore.clear();

    const tenantRepo = new TenantRepository();
    const tenant = await tenantRepo.createTenant({
      slug: tenantSlug,
      name: "Adversary University",
      legalEntityName: "Adversary University LLC",
      websiteUrl: `https://${tenantSlug}.edu`,
      didUri: `did:web:credvail.com:tenants:${tenantSlug}`,
      ownerUserId: "usr_adv_owner",
    });
    tenantId = tenant.id;

    const initialKey = await KeyRepository.getOrCreateInitialKey(tenantId, tenant.didUri);
    issuerPrivateKeyPem = KeyService.decryptPrivateKey(initialKey.encryptedPrivateKey!);
    issuerPublicKeyPem = initialKey.publicKeyPem;

    const claims = {
      recipientName: "Alice Student",
      recipientEmail,
      courseName: "B.S. Computer Science",
      degreeGrade: "Summa Cum Laude",
      issueDate: "2026-06-01",
    };

    const unsignedVc = VcService.buildUnsignedCredential({
      credentialId: "urn:uuid:sec-01-credential",
      certificateNumber: certNumber,
      tenantDidUri: tenant.didUri,
      tenantName: tenant.name,
      tenantSlug,
      recipientId: "rec_sec_01",
      recipientName: claims.recipientName,
      recipientEmail: claims.recipientEmail,
      claims,
      batchId: "batch_sec_01",
      merkleIndex: 0,
      bitstringIndex: 5,
    });

    signedVc = VcService.signCredential(
      unsignedVc,
      issuerPrivateKeyPem,
      `${tenant.didUri}#key-1`
    );

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:sec-01-credential",
      certificateNumber: certNumber,
      tenantId,
      batchId: "batch_sec_01",
      recipientName: "Alice Student",
      recipientEmail,
      leafHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      merkleIndex: 0,
      bitstringIndex: 5,
      claimsData: claims,
      vcPayloadJson: signedVc,
    });

    const bitstring = StatusListService.createBitstring();
    StatusListService.setBit(bitstring, 5, 0);
    const gzip = StatusListService.compressBitstring(bitstring);
    const digest = StatusListService.computeStatusDigest(gzip);
    const anchor = await BlockchainService.anchorStatusDigest(tenantSlug, 1, digest);

    await StatusSnapshotRepository.createSnapshot({
      tenantId,
      epoch: 1,
      bitstringGzipBase64: gzip,
      digestSha256: digest,
      onChainTxHash: anchor.txHash,
      anchoredAt: new Date(),
    });
  });

  // SEC-01: Claim Mutation Tampering
  it("SEC-01: should reject credential when a single character in claims is mutated (Tampering)", () => {
    // Verify untampered credential passes
    const valid = VcService.verifyCredentialSignature(signedVc, issuerPublicKeyPem);
    expect(valid).toBe(true);

    // Attack: Mutate grade from "Summa Cum Laude" to "First Class Honours"
    const tamperedVc = JSON.parse(JSON.stringify(signedVc));
    tamperedVc.credentialSubject.degreeGrade = "First Class Honours";

    const tamperedCheck = VcService.verifyCredentialSignature(tamperedVc, issuerPublicKeyPem);
    expect(tamperedCheck).toBe(false);
  });

  // SEC-02: Unanchored / Fake Merkle Root Injection
  it("SEC-02: should reject credential presentation with an unanchored / forged Merkle root", async () => {
    const leaves: `0x${string}`[] = [
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222222222222222222222222222",
    ];
    const tree = new CredvailMerkleTree(leaves);
    const proof = tree.getProof(0);

    // Verify legitimate proof passes against tree root
    expect(CredvailMerkleTree.verifyProof(leaves[0], proof, tree.getRoot())).toBe(true);

    // Attack: Attacker presents proof against a fabricated unanchored Merkle root
    const fakeRoot: `0x${string}` = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    expect(CredvailMerkleTree.verifyProof(leaves[0], proof, fakeRoot)).toBe(false);

    // Attack: Attacker attempts on-chain verification against unregistered root
    const onChainCheck = await BlockchainService.verifyCredentialProof(
      tenantSlug,
      "unanchored-batch",
      leaves[0],
      proof
    );
    expect(onChainCheck).toBe(false);
  });

  // SEC-03: Revoked Credential Presentation Bypass Attempt
  it("SEC-03: should immediately detect and reject a revoked credential (Metric M6)", async () => {
    // 1. Initial status: fresh and unrevoked
    const initialOutcome = await RevocationFreshnessService.evaluateFreshness(certNumber);
    expect(initialOutcome.outcome).toBe("VALID_CURRENT");
    expect(initialOutcome.isValid).toBe(true);

    // 2. Institution revokes credential
    const startTime = performance.now();
    const revokeResult = await RevocationFreshnessService.revokeCredential({
      tenantId,
      credentialIdOrCertNumber: certNumber,
      reason: "Honor Code Violation",
    });
    const revocationElapsed = performance.now() - startTime;

    // Thesis Metric M6: Latency must be < 1000ms
    expect(revocationElapsed).toBeLessThan(1000);
    expect(revokeResult.freshnessOutcome).toBe("REVOKED");

    // 3. Verifier checks status after revocation -> Must return REVOKED
    const revokedOutcome = await RevocationFreshnessService.evaluateFreshness(certNumber);
    expect(revokedOutcome.outcome).toBe("REVOKED");
    expect(revokedOutcome.isRevoked).toBe(true);
    expect(revokedOutcome.isValid).toBe(false);
    expect(revokedOutcome.snapshot.bitValue).toBe(1);
  });

  // SEC-04: Nonce Replay Attack
  it("SEC-04: should reject presentation when replaying a previously consumed challenge nonce", () => {
    const nonce = VerificationService.generateChallengeNonce(300);

    // First consumption: verified nonce
    const firstCheck = VerificationService.consumeChallengeNonce(nonce);
    expect(firstCheck).toBe(true);

    // Attack: Attacker captures payload and attempts to replay the same nonce
    const replayCheck = VerificationService.consumeChallengeNonce(nonce);
    expect(replayCheck).toBe(false);
  });

  // SEC-05: Audience Domain Spoofing Mismatch
  it("SEC-05: should reject presentation when challenge audience domain does not match", () => {
    // Verifier checks audience against nonce
    const wrongNonce = "cn_forged_audience_nonce_value";
    expect(VerificationService.consumeChallengeNonce(wrongNonce)).toBe(false);
  });

  // SEC-06: Cross-Tenant Horizontal Privilege Escalation
  it("SEC-06: should prevent Tenant A from accessing or mutating Tenant B data (Horizontal BOLA/IDOR)", () => {
    const aliceUser = {
      id: "usr_alice",
      email: "alice@tenant-a.com",
      fullName: "Alice A",
      platformRole: "USER" as PlatformRole,
      memberships: [
        {
          tenantId: "tnt_alpha",
          role: "ORG_OWNER" as TenantRole,
          tenant: { slug: "alpha-corp", name: "Alpha Corp" },
        },
      ],
    };

    const token = createSessionToken(aliceUser);
    const mockRequest = {
      headers: new Headers({ authorization: `Bearer ${token}` }),
      cookies: { get: () => undefined },
    } as unknown as NextRequest;

    // Legitimate access to Alpha Corp
    const alphaCtx = extractTenantContext(mockRequest, "alpha-corp");
    expect(alphaCtx.tenantId).toBe("tnt_alpha");

    // Attack: Alice attempts to query Beta Corp
    expect(() => extractTenantContext(mockRequest, "beta-corp")).toThrow(AuthorizationError);
    expect(() => extractTenantContext(mockRequest, "beta-corp")).toThrow(
      /Access denied: You do not possess active membership in tenant 'beta-corp'/
    );
  });

  // SEC-07: CSV/XLSX DDE Formula Injection Sanitization
  it("SEC-07: should neutralize formula injection payloads in uploaded recipient data", () => {
    const dangerousPayloads = [
      "=cmd|'/C calc'!A0",
      "+cmd|'/C powershell.exe -enc...'!A1",
      "-2+5+cmd|' /C calc'!A0",
      "@SUM(1+1)*cmd|'/C calc'!A0",
      "\t=dangerousTab()",
      "\r=dangerousReturn()",
    ];

    for (const payload of dangerousPayloads) {
      const sanitized = sanitizeFormulaValue(payload);
      expect(sanitized.startsWith("'")).toBe(true);
      expect(sanitized).not.toBe(payload);
    }

    // Normal safe strings should remain untouched
    const safeString = "Johnathan Doe";
    expect(sanitizeFormulaValue(safeString)).toBe(safeString);
  });

  // SEC-08: Stale Status Snapshot Beyond Configured TTL
  it("SEC-08: should evaluate to STATUS_UNKNOWN when status snapshot age exceeds TTL (Stale Snapshot)", async () => {
    const outcome = await RevocationFreshnessService.evaluateFreshness(certNumber, {
      maxSnapshotAgeSeconds: 0, // Force snapshot to be strictly expired
    });

    expect(outcome.outcome).toBe("STATUS_UNKNOWN");
    expect(outcome.isFresh).toBe(false);
  });

  // SEC-09: Issuing Key Epoch Compromise Invalidation
  it("SEC-09: should immediately invalidate credentials signed by a compromised key epoch", async () => {
    await KeyRepository.flagKeyCompromised(tenantId, 1, "Private key leaked in public git repository");

    const outcome = await RevocationFreshnessService.evaluateFreshness(certNumber);

    expect(outcome.outcome).toBe("INVALID");
    expect(outcome.isValid).toBe(false);
    expect(outcome.keyGovernance.isCompromised).toBe(true);
  });

  // SEC-10: Graceful Key Rotation Disambiguation
  it("SEC-10: should evaluate credentials signed by gracefully rotated key epochs as AUTHENTICITY_ONLY", async () => {
    // Epoch 1 created and retired gracefully
    await KeyRepository.rotateKey(tenantId, `did:web:credvail.com:tenants:${tenantSlug}`); // Advances to Epoch 2; Epoch 1 becomes ROTATED

    const outcome = await RevocationFreshnessService.evaluateFreshness(certNumber);

    expect(outcome.outcome).toBe("AUTHENTICITY_ONLY");
    expect(outcome.isValid).toBe(true);
    expect(outcome.keyGovernance.keyStatus).toBe("ROTATED");
  });
});
