import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import { VerificationService } from "@/lib/services/verification-service";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { TenantRepository } from "@/lib/repositories/tenant-repository";
import { BatchRepository } from "@/lib/repositories/batch-repository";
import { KeyRepository } from "@/lib/repositories/key-repository";
import { KeyService } from "@/lib/crypto/key-service";
import { VcService, W3CVerifiableCredential } from "@/lib/crypto/vc-service";
import { BlockchainService } from "@/lib/blockchain/blockchain-service";
import { canonicalizeJson } from "@/lib/crypto/canonical";

describe("Phase 10: Public Verification Engine & Trust Architecture", () => {
  const tenantSlug = "harvard-verify";
  let tenantId: string;
  let didUri: string;
  let batchId: string;
  let keyPair: ReturnType<typeof KeyService.generateEcdsaKeyPair>;
  let credentialRecord: any;
  let signedVc: W3CVerifiableCredential;

  beforeEach(async () => {
    // Reset in-memory test stores
    CredentialRepository.resetInMemoryStore();
    BlockchainService.resetSimulatedState();
    KeyRepository.resetInMemoryStore();

    const tenantRepo = new TenantRepository();
    let tenant = await tenantRepo.findBySlug(tenantSlug);
    if (!tenant) {
      tenant = await tenantRepo.createTenant({
        slug: tenantSlug,
        name: "Harvard University Division of Continuing Education",
        legalEntityName: "The President and Fellows of Harvard College",
        websiteUrl: "https://harvard.edu",
        didUri: `did:web:credvail.com:tenants:${tenantSlug}`,
        ownerUserId: "usr_admin_harvard",
      });
    }
    tenantId = tenant.id;
    didUri = tenant.didUri;

    // Ensure Epoch 1 key exists and retrieve private key
    const issuerKey = await KeyRepository.getOrCreateInitialKey(tenantId, didUri);
    const privateKeyPem = KeyService.decryptPrivateKey(issuerKey.encryptedPrivateKey!);

    // Create issuance batch
    const batch = await BatchRepository.createBatch({
      tenantId,
      templateId: "tpl_standard_cert",
      issuerKeyId: issuerKey.id,
      title: "Executive Leadership Cohort 2026",
      stagedRecipients: [
        {
          fullName: "Alice Verifier",
          email: "alice@example.com",
          certificateNumberPreview: "HARV-2026-000101",
          courseName: "Advanced Cryptographic Systems",
          issueDate: "2026-11-15",
          status: "VALID",
        },
      ],
    });
    batchId = batch.id;

    // Issue signed W3C Verifiable Credential
    const credentialId = "urn:uuid:6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const certNumber = "HARV-2026-000101";

    const unsignedVc = VcService.buildUnsignedCredential({
      credentialId,
      certificateNumber: certNumber,
      tenantDidUri: didUri,
      tenantName: tenant.name,
      tenantSlug,
      recipientId: "rec_alice",
      recipientName: "Alice Verifier",
      recipientEmail: "alice@example.com",
      claims: {
        recipient_name: "Alice Verifier",
        recipient_email: "alice@example.com",
        certificate_number: certNumber,
        course_name: "Advanced Cryptographic Systems",
        issue_date: "2026-11-15",
      },
      batchId,
      merkleIndex: 0,
      bitstringIndex: 0,
    });

    signedVc = VcService.signCredential(
      unsignedVc,
      privateKeyPem,
      `${didUri}#key-1`
    );

    const vcHash = VcService.computeVcHash(signedVc);
    const leafHash = VcService.computeLeafHash(credentialId, certNumber, vcHash);

    // Build 1-leaf Merkle tree
    const tree = VcService.buildBatchMerkleTree([leafHash]);
    const merkleProof = VcService.generateMerkleProof(tree, 0);

    const vcWithEvidence = VcService.attachMerkleProof(signedVc, merkleProof, batchId);
    signedVc = vcWithEvidence;

    // Anchor batch on simulated Sepolia blockchain
    const anchorReceipt = await BlockchainService.anchorBatch(
      tenantSlug,
      batchId,
      tree.getRoot(),
      1
    );

    await BatchRepository.updateBatchStatus(tenantId, batchId, "GENERATED", {
      merkleRoot: tree.getRoot(),
      onChainTxHash: anchorReceipt.txHash,
      blockchainBlockNumber: anchorReceipt.blockNumber,
    });

    // Store in credential repository
    credentialRecord = await CredentialRepository.createCredential({
      tenantId,
      batchId,
      credentialId,
      certificateNumber: certNumber,
      recipientName: "Alice Verifier",
      recipientEmail: "alice@example.com",
      leafHash,
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: {
        recipient_name: "Alice Verifier",
        recipient_email: "alice@example.com",
        certificate_number: certNumber,
        course_name: "Advanced Cryptographic Systems",
      },
      vcPayloadJson: signedVc as any,
      merkleProof,
      pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // dummy %PDF
    });
  });

  it("1. should successfully verify an authentic issued credential across all 5 layers", async () => {
    const result = await VerificationService.verifyByPublicId("HARV-2026-000101");

    expect(result.status).toBe("VALID");
    expect(result.isValid).toBe(true);
    expect(result.credential.recipientName).toBe("Alice Verifier");
    expect(result.credential.certificateNumber).toBe("HARV-2026-000101");
    expect(result.issuer.slug).toBe(tenantSlug);
    expect(result.cryptography.signatureValid).toBe(true);
    expect(result.cryptography.canonicalHashMatches).toBe(true);
    expect(result.cryptography.merkleProofValid).toBe(true);
    expect(result.blockchain.anchored).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("2. should reject verification when claims are altered (tampering detection)", async () => {
    // Tamper with credential payload: change recipient name in memory
    const tamperedPayload = JSON.parse(JSON.stringify(signedVc));
    tamperedPayload.credentialSubject.claims.recipient_name = "Mallory Attacker";
    tamperedPayload.credentialSubject.name = "Mallory Attacker";

    await CredentialRepository.updateCredentialPayload(
      tenantId,
      credentialRecord.id,
      tamperedPayload
    );

    const result = await VerificationService.verifyByPublicId("HARV-2026-000101");

    expect(result.isValid).toBe(false);
    expect(result.status).toBe("INVALID");
    expect(result.cryptography.signatureValid).toBe(false);
    expect(result.cryptography.canonicalHashMatches).toBe(false);

    const tamperCheck = result.checks.find((c) => c.code === "RFC8785_CANONICAL_HASH");
    expect(tamperCheck?.passed).toBe(false);
  });

  it("3. should reject verification when ECDSA P-256 digital signature is corrupted", async () => {
    const corruptedVc = JSON.parse(JSON.stringify(signedVc));
    // Corrupt signature
    corruptedVc.proof.jws = corruptedVc.proof.jws.slice(0, -4) + "ffff";

    await CredentialRepository.updateCredentialPayload(
      tenantId,
      credentialRecord.id,
      corruptedVc
    );

    const result = await VerificationService.verifyByPublicId("HARV-2026-000101");

    expect(result.isValid).toBe(false);
    expect(result.status).toBe("INVALID");
    expect(result.cryptography.signatureValid).toBe(false);

    const sigCheck = result.checks.find((c) => c.code === "ECDSA_P256_SIGNATURE");
    expect(sigCheck?.passed).toBe(false);
  });

  it("4. should reject verification when Merkle proof siblings are corrupted", async () => {
    const corruptProof = {
      ...credentialRecord.merkleProof,
      proof: ["0x000000000000000000000000000000000000000000000000000000000000dead"],
    };

    CredentialRepository.storeMerkleProof(credentialRecord.id, corruptProof);

    const result = await VerificationService.verifyByPublicId("HARV-2026-000101");

    expect(result.isValid).toBe(false);
    expect(result.status).toBe("INVALID");
    expect(result.cryptography.merkleProofValid).toBe(false);

    const merkleCheck = result.checks.find((c) => c.code === "MERKLE_INCLUSION_PROOF");
    expect(merkleCheck?.passed).toBe(false);
  });

  it("5. should detect and report REVOKED status when credential is formally revoked", async () => {
    const reason = "Academic credential annulled due to honor code violation";
    await CredentialRepository.revokeCredential(tenantId, credentialRecord.id, reason);

    const result = await VerificationService.verifyByPublicId("HARV-2026-000101");

    expect(result.isValid).toBe(false);
    expect(result.status).toBe("REVOKED");
    expect(result.credential.state).toBe("REVOKED");

    const revCheck = result.checks.find((c) => c.code === "REVOCATION_STATUS");
    expect(revCheck?.passed).toBe(false);
    expect(result.warnings).toBeDefined();
    expect(result.warnings?.some((w) => w.includes("revoked"))).toBe(true);
  });

  it("6. should detect and report COMPROMISED status when key epoch is flagged (SEC-09)", async () => {
    // Flag epoch 1 compromised
    await KeyRepository.flagKeyCompromised(tenantId, 1);

    const result = await VerificationService.verifyByPublicId("HARV-2026-000101");

    expect(result.isValid).toBe(false);
    expect(result.status).toBe("COMPROMISED");
    expect(result.issuer.keyStatus).toBe("COMPROMISED");

    const compCheck = result.checks.find((c) => c.code === "KEY_COMPROMISE_CHECK");
    expect(compCheck?.passed).toBe(false);
  });

  it("7. should resolve credential across all 4 identifier formats", async () => {
    // A. By Certificate Number
    const resCert = await VerificationService.verifyByPublicId("HARV-2026-000101");
    expect(resCert.status).toBe("VALID");

    // B. By URN
    const resUrn = await VerificationService.verifyByPublicId("urn:uuid:6ba7b810-9dad-11d1-80b4-00c04fd430c8");
    expect(resUrn.status).toBe("VALID");

    // C. By raw UUID
    const resUuid = await VerificationService.verifyByPublicId("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
    expect(resUuid.status).toBe("VALID");

    // D. By internal ID
    const resInternal = await VerificationService.verifyByPublicId(credentialRecord.id);
    expect(resInternal.status).toBe("VALID");
  });

  it("8. should verify an uploaded raw W3C Verifiable Credential JSON", async () => {
    const result = await VerificationService.verifyRawCredential(signedVc as any);

    expect(result.status).toBe("VALID");
    expect(result.isValid).toBe(true);
    expect(result.credential.recipientName).toBe("Alice Verifier");
    expect(result.cryptography.signatureValid).toBe(true);
  });

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

  it("9. verifies a holder-signed presentation only with its one-use challenge and audience", async () => {
    const audience = "https://verifier.example.test";
    const { nonce } = VerificationService.createChallengeNonce(300, audience);
    const vp = createSignedHolderPresentation(nonce, audience);

    const result = await VerificationService.verifyPresentation(vp, nonce);

    expect(result.status).toBe("VALID");
    expect(result.isValid).toBe(true);
    expect(result.checks.find((c) => c.code === "CHALLENGE_NONCE_VERIFICATION")?.passed).toBe(true);
    expect(result.checks.find((c) => c.code === "HOLDER_PRESENTATION_SIGNATURE")?.passed).toBe(true);
  });

  it("10. rejects replay of a holder presentation challenge", async () => {
    const audience = "https://verifier.example.test";
    const { nonce } = VerificationService.createChallengeNonce(300, audience);
    const vp = createSignedHolderPresentation(nonce, audience);

    const firstResult = await VerificationService.verifyPresentation(vp, nonce);
    expect(firstResult.isValid).toBe(true);

    const replayResult = await VerificationService.verifyPresentation(vp, nonce);
    expect(replayResult.isValid).toBe(false);
    expect(replayResult.status).toBe("INVALID");
    expect(replayResult.checks.find((c) => c.code === "CHALLENGE_NONCE_VERIFICATION")?.passed).toBe(false);
  });

  it("11. rejects presentations when no challenge nonce is supplied", async () => {
    const audience = "https://verifier.example.test";
    const { nonce } = VerificationService.createChallengeNonce(300, audience);
    const vp = createSignedHolderPresentation(nonce, audience);

    const result = await VerificationService.verifyPresentation(vp);
    expect(result.isValid).toBe(false);
    expect(result.status).toBe("INVALID");
    expect(result.checks.find((c) => c.code === "CHALLENGE_NONCE_VERIFICATION")?.passed).toBe(false);
    expect(result.credential.recipientEmail).toBeUndefined();
    expect(result.credential.recipientName).toBe("Undisclosed");
    expect(result.credential.claims).toEqual({});
  });

  it("12. rejects presentations that have a valid credential but no holder proof", async () => {
    const audience = "https://verifier.example.test";
    const { nonce } = VerificationService.createChallengeNonce(300, audience);
    const vp = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiablePresentation"],
      id: "urn:uuid:presentation-without-holder-proof",
      verifiableCredential: [signedVc],
    };

    const result = await VerificationService.verifyPresentation(vp, nonce);
    expect(result.isValid).toBe(false);
    expect(result.status).toBe("INVALID");
    expect(result.checks.find((c) => c.code === "HOLDER_PRESENTATION_SIGNATURE")?.passed).toBe(false);
    expect(result.credential.recipientEmail).toBeUndefined();
    expect(result.credential.recipientName).toBe("Undisclosed");
    expect(result.credential.claims).toEqual({});
  });

  it("13. rejects a presentation signed for a different verifier audience", async () => {
    const expectedAudience = "https://verifier.example.test";
    const wrongAudience = "https://attacker.example.test";
    const { nonce } = VerificationService.createChallengeNonce(300, expectedAudience);
    const vp = createSignedHolderPresentation(nonce, wrongAudience);

    const rejected = await VerificationService.verifyPresentation(vp, nonce);
    expect(rejected.isValid).toBe(false);
    expect(rejected.checks.find((c) => c.code === "CHALLENGE_NONCE_VERIFICATION")?.passed).toBe(false);

    // A mismatched audience must not consume the valid challenge.
    const correctlyBoundVp = createSignedHolderPresentation(nonce, expectedAudience);
    const accepted = await VerificationService.verifyPresentation(correctlyBoundVp, nonce);
    expect(accepted.isValid).toBe(true);
  });

  it("14. rejects a tampered holder signature without consuming the challenge", async () => {
    const audience = "https://verifier.example.test";
    const { nonce } = VerificationService.createChallengeNonce(300, audience);
    const vp = createSignedHolderPresentation(nonce, audience);
    vp.proof.jws = `${vp.proof.jws.slice(0, -4)}0000`;

    const rejected = await VerificationService.verifyPresentation(vp, nonce);
    expect(rejected.isValid).toBe(false);
    expect(rejected.checks.find((c) => c.code === "HOLDER_PRESENTATION_SIGNATURE")?.passed).toBe(false);

    const validVp = createSignedHolderPresentation(nonce, audience);
    const accepted = await VerificationService.verifyPresentation(validVp, nonce);
    expect(accepted.isValid).toBe(true);
  });

  it("15. Empirical Metric M1: Median verification latency < 250ms", async () => {
    const latencies: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await VerificationService.verifyByPublicId("HARV-2026-000101");
      latencies.push(res.verificationLatencyMs);
    }

    latencies.sort((a, b) => a - b);
    const median = latencies[Math.floor(latencies.length / 2)];

    expect(median).toBeLessThan(250);
  });

  it("16. Empirical Metric M4: Cryptographic Merkle proof verification latency < 2ms", async () => {
    const res = await VerificationService.verifyByPublicId("HARV-2026-000101");
    const merkleLatency = res.cryptography.merkleVerificationLatencyMs ?? 0;

    expect(merkleLatency).toBeLessThan(2.0);
  });
});
