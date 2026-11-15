import { describe, it, expect, beforeEach } from "vitest";
import { RevocationFreshnessService } from "@/lib/services/revocation-freshness-service";
import { StatusListService } from "@/lib/services/status-list-service";
import { StatusSnapshotRepository } from "@/lib/repositories/status-snapshot-repository";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { TenantRepository, inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { KeyRepository } from "@/lib/repositories/key-repository";
import { KeyService } from "@/lib/crypto/key-service";
import { VcService } from "@/lib/crypto/vc-service";
import { TemplateRepository } from "@/lib/repositories/template-repository";
import { BatchRepository } from "@/lib/repositories/batch-repository";
import { TEMPLATE_PRESETS } from "@/lib/templates/presets";

describe("Phase 12: 5-State Freshness Evaluation Semantics Unit Tests", () => {
  let tenantId = "tnt_freshness_test";
  const tenantSlug = "mit-lincoln";
  const certNumber = "MIT-LL-2026-001";
  const recipientEmail = "researcher@ll.mit.edu";

  beforeEach(async () => {
    StatusListService.resetInMemoryStore();
    StatusSnapshotRepository.resetInMemoryStore();
    CredentialRepository.resetInMemoryStore();
    inMemoryTenantStore.clear();
    KeyRepository.resetInMemoryStore();
    TemplateRepository.resetInMemoryStore();
    BatchRepository.resetInMemoryStore();

    // 1. Create Tenant & Key Epoch 1
    const tenantRepo = new TenantRepository();
    const tenant = await tenantRepo.createTenant({
      slug: tenantSlug,
      name: "MIT Lincoln Laboratory",
      legalEntityName: "Massachusetts Institute of Technology",
      websiteUrl: "https://ll.mit.edu",
      didUri: `did:web:credvail.com:tenants:${tenantSlug}`,
      ownerUserId: "usr_dir_lincoln",
    });
    tenantId = tenant.id;

    const initialKey = await KeyRepository.getOrCreateInitialKey(tenantId, tenant.didUri);
    const privateKeyPem = KeyService.decryptPrivateKey(initialKey.encryptedPrivateKey!);

    // 2. Create Template & Batch
    const templateRepo = new TemplateRepository();
    const template = await templateRepo.createTemplate({
      tenantId,
      title: "Defense Research Fellowship",
      category: "COURSE_COMPLETION",
      layoutConfig: TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig,
    });

    const batch = await BatchRepository.createBatch({
      tenantId,
      templateId: template.id,
      title: "Batch Lincoln 2026",
      stagedRecipients: [
        {
          fullName: "Dr. Evelyn Reed",
          email: recipientEmail,
          certificateNumberPreview: certNumber,
          issueDate: "2026-01-15",
          status: "VALID",
        },
      ],
    });

    // 3. Issue and Sign Credential
    const unsignedVc = VcService.buildUnsignedCredential({
      credentialId: "urn:uuid:mit-ll-001",
      certificateNumber: certNumber,
      tenantDidUri: tenant.didUri,
      tenantName: tenant.name,
      tenantSlug,
      recipientId: "rec_evelyn",
      recipientName: "Dr. Evelyn Reed",
      recipientEmail,
      claims: { program: "Advanced Radar & Signal Processing" },
      batchId: batch.id,
      merkleIndex: 0,
      bitstringIndex: 5,
    });

    const signedVc = VcService.signCredential(
      unsignedVc,
      privateKeyPem,
      `${tenant.didUri}#key-1`
    );

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:mit-ll-001",
      certificateNumber: certNumber,
      tenantId,
      batchId: batch.id,
      recipientName: "Dr. Evelyn Reed",
      recipientEmail,
      leafHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      merkleIndex: 0,
      bitstringIndex: 5,
      claimsData: { program: "Advanced Radar & Signal Processing" },
      vcPayloadJson: signedVc as any,
    });

    // 4. Publish initial fresh status snapshot (bit 5 = 0)
    const bitstring = StatusListService.createBitstring();
    StatusListService.setBit(bitstring, 5, 0);
    const gzip = StatusListService.compressBitstring(bitstring);
    const digest = StatusListService.computeStatusDigest(gzip);

    await StatusSnapshotRepository.createSnapshot({
      tenantId,
      epoch: 1,
      bitstringGzipBase64: gzip,
      digestSha256: digest,
      onChainTxHash: "0xinitial_anchor_tx",
      anchoredAt: new Date(),
    });
  });

  it("1. evaluates to VALID_CURRENT when cryptographic proofs pass, key is active, and status bit is 0", async () => {
    const result = await RevocationFreshnessService.evaluateFreshness(certNumber);

    expect(result.outcome).toBe("VALID_CURRENT");
    expect(result.isValid).toBe(true);
    expect(result.isRevoked).toBe(false);
    expect(result.isFresh).toBe(true);
    expect(result.keyGovernance.keyStatus).toBe("ACTIVE");
    expect(result.snapshot.bitValue).toBe(0);
  });

  it("2. evaluates to REVOKED when bit is set to 1 in status list bitstring", async () => {
    // Revoke credential via service
    const revokeOutcome = await RevocationFreshnessService.revokeCredential({
      tenantId,
      credentialIdOrCertNumber: certNumber,
      reason: "Research misconduct",
    });

    expect(revokeOutcome.freshnessOutcome).toBe("REVOKED");

    // Freshness evaluation now yields REVOKED
    const result = await RevocationFreshnessService.evaluateFreshness(certNumber);

    expect(result.outcome).toBe("REVOKED");
    expect(result.isValid).toBe(false);
    expect(result.isRevoked).toBe(true);
    expect(result.snapshot.bitValue).toBe(1);
    expect(result.credential.revocationReason).toBe("Research misconduct");
  });

  it("3. evaluates to AUTHENTICITY_ONLY when issuing key was rotated gracefully", async () => {
    // Rotate institution key to Epoch 2
    const rotated = await KeyRepository.rotateKey(tenantId, `did:web:credvail.com:tenants:${tenantSlug}`);
    expect(rotated.keyEpoch).toBe(2);

    // Old key is now ROTATED (not active, but not compromised)
    const result = await RevocationFreshnessService.evaluateFreshness(certNumber);

    expect(result.outcome).toBe("AUTHENTICITY_ONLY");
    expect(result.isValid).toBe(true);
    expect(result.isRevoked).toBe(false);
    expect(result.keyGovernance.keyStatus).toBe("ROTATED");
  });

  it("4. evaluates to STATUS_UNKNOWN when snapshot exceeds TTL or network is unavailable", async () => {
    // Simulate network offline
    const offlineResult = await RevocationFreshnessService.evaluateFreshness(certNumber, {
      simulateNetworkFailure: true,
    });

    expect(offlineResult.outcome).toBe("STATUS_UNKNOWN");
    expect(offlineResult.isValid).toBe(false);

    // Simulate TTL expiration (max snapshot age 0 seconds)
    const ttlExpiredResult = await RevocationFreshnessService.evaluateFreshness(certNumber, {
      maxSnapshotAgeSeconds: 0,
    });

    expect(ttlExpiredResult.outcome).toBe("STATUS_UNKNOWN");
    expect(ttlExpiredResult.isFresh).toBe(false);
  });

  it("5. evaluates to INVALID when issuing key epoch is flagged COMPROMISED (SEC-09)", async () => {
    // Flag Key Epoch 1 as COMPROMISED
    await KeyRepository.flagKeyCompromised(tenantId, 1);

    const result = await RevocationFreshnessService.evaluateFreshness(certNumber);

    expect(result.outcome).toBe("INVALID");
    expect(result.isValid).toBe(false);
    expect(result.keyGovernance.isCompromised).toBe(true);
    expect(result.keyGovernance.keyStatus).toBe("COMPROMISED");
  });
});
