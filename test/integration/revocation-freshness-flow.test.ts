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
import { BlockchainService } from "@/lib/blockchain/blockchain-service";
import { TEMPLATE_PRESETS } from "@/lib/templates/presets";

describe("Phase 12: End-to-End Revocation and Freshness Integration Flow", () => {
  let tenantId = "tnt_cambridge_eng";
  const tenantSlug = "cambridge-engineering";
  const cert1 = "CAM-2026-ENG-001";
  const cert2 = "CAM-2026-ENG-002";

  beforeEach(async () => {
    StatusListService.resetInMemoryStore();
    StatusSnapshotRepository.resetInMemoryStore();
    CredentialRepository.resetInMemoryStore();
    inMemoryTenantStore.clear();
    KeyRepository.resetInMemoryStore();
    TemplateRepository.resetInMemoryStore();
    BatchRepository.resetInMemoryStore();
    BlockchainService.resetSimulatedState();

    // 1. Setup Tenant & Key Epoch 1
    const tenantRepo = new TenantRepository();
    const tenant = await tenantRepo.createTenant({
      slug: tenantSlug,
      name: "University of Cambridge Department of Engineering",
      legalEntityName: "The Chancellor Masters and Scholars of Cambridge",
      websiteUrl: "https://eng.cam.ac.uk",
      didUri: `did:web:credvail.com:tenants:${tenantSlug}`,
      ownerUserId: "usr_cambridge_head",
    });
    tenantId = tenant.id;

    const key1 = await KeyRepository.getOrCreateInitialKey(tenantId, tenant.didUri);
    const privateKey1 = KeyService.decryptPrivateKey(key1.encryptedPrivateKey!);

    // 2. Setup Template & Batch with 2 Recipients
    const templateRepo = new TemplateRepository();
    const template = await templateRepo.createTemplate({
      tenantId,
      title: "Master of Engineering in Aerospace Structures",
      category: "COURSE_COMPLETION",
      layoutConfig: TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig,
    });

    const batch = await BatchRepository.createBatch({
      tenantId,
      templateId: template.id,
      title: "Aerospace 2026 Cohort",
      stagedRecipients: [
        {
          fullName: "Recipient One",
          email: "one@cam.ac.uk",
          certificateNumberPreview: cert1,
          issueDate: "2026-06-20",
          status: "VALID",
        },
        {
          fullName: "Recipient Two",
          email: "two@cam.ac.uk",
          certificateNumberPreview: cert2,
          issueDate: "2026-06-20",
          status: "VALID",
        },
      ],
    });

    // 3. Issue and Sign Credentials (indices 10 and 11)
    const vc1 = VcService.signCredential(
      VcService.buildUnsignedCredential({
        credentialId: "urn:uuid:cam-001",
        certificateNumber: cert1,
        tenantDidUri: tenant.didUri,
        tenantName: tenant.name,
        tenantSlug,
        recipientId: "rec_one",
        recipientName: "Recipient One",
        recipientEmail: "one@cam.ac.uk",
        claims: { award: "Distinction" },
        batchId: batch.id,
        merkleIndex: 0,
        bitstringIndex: 10,
      }),
      privateKey1,
      `${tenant.didUri}#key-1`
    );

    const vc2 = VcService.signCredential(
      VcService.buildUnsignedCredential({
        credentialId: "urn:uuid:cam-002",
        certificateNumber: cert2,
        tenantDidUri: tenant.didUri,
        tenantName: tenant.name,
        tenantSlug,
        recipientId: "rec_two",
        recipientName: "Recipient Two",
        recipientEmail: "two@cam.ac.uk",
        claims: { award: "Merit" },
        batchId: batch.id,
        merkleIndex: 1,
        bitstringIndex: 11,
      }),
      privateKey1,
      `${tenant.didUri}#key-1`
    );

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:cam-001",
      certificateNumber: cert1,
      tenantId,
      batchId: batch.id,
      recipientName: "Recipient One",
      recipientEmail: "one@cam.ac.uk",
      leafHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      merkleIndex: 0,
      bitstringIndex: 10,
      claimsData: { award: "Distinction" },
      vcPayloadJson: vc1 as any,
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:cam-002",
      certificateNumber: cert2,
      tenantId,
      batchId: batch.id,
      recipientName: "Recipient Two",
      recipientEmail: "two@cam.ac.uk",
      leafHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
      merkleIndex: 1,
      bitstringIndex: 11,
      claimsData: { award: "Merit" },
      vcPayloadJson: vc2 as any,
    });

    // 4. Initial Status Snapshot (Epoch 1)
    const initialBits = StatusListService.createBitstring();
    const gzip = StatusListService.compressBitstring(initialBits);
    const digest = StatusListService.computeStatusDigest(gzip);

    const anchorRes = await BlockchainService.anchorStatusDigest(tenantSlug, 1, digest);
    await StatusSnapshotRepository.createSnapshot({
      tenantId,
      epoch: 1,
      bitstringGzipBase64: gzip,
      digestSha256: digest,
      onChainTxHash: anchorRes.txHash,
      anchoredAt: new Date(),
    });
  });

  it("executes complete lifecycle: initial validity -> instant revocation (M6) -> sibling isolation -> key rotation -> key compromise (SEC-09)", async () => {
    // ------------------------------------------------------------------------
    // Step 1: Initial State - Both credentials evaluate to VALID_CURRENT
    // ------------------------------------------------------------------------
    const initial1 = await RevocationFreshnessService.evaluateFreshness(cert1);
    const initial2 = await RevocationFreshnessService.evaluateFreshness(cert2);

    expect(initial1.outcome).toBe("VALID_CURRENT");
    expect(initial1.isValid).toBe(true);
    expect(initial1.snapshot.bitValue).toBe(0);

    expect(initial2.outcome).toBe("VALID_CURRENT");
    expect(initial2.isValid).toBe(true);
    expect(initial2.snapshot.bitValue).toBe(0);

    // ------------------------------------------------------------------------
    // Step 2: Instant Revocation of Credential 1 (Metric M6: < 1.0s)
    // ------------------------------------------------------------------------
    const t0 = performance.now();
    const revokeOutcome = await RevocationFreshnessService.revokeCredential({
      tenantId,
      credentialIdOrCertNumber: cert1,
      reason: "Academic integrity violation",
      anchorOnChain: true,
    });
    const revocationLatencyMs = performance.now() - t0;

    // Empirical Metric M6: Detection / Revocation latency < 1.0s (1000ms)
    expect(revocationLatencyMs).toBeLessThan(1000);
    expect(revokeOutcome.freshnessOutcome).toBe("REVOKED");
    expect(revokeOutcome.txHash).toBeDefined();
    expect(revokeOutcome.snapshot.epoch).toBe(2);

    // ------------------------------------------------------------------------
    // Step 3: Verify Zero Collateral Damage to Sibling Credential 2
    // ------------------------------------------------------------------------
    const evalRevoked = await RevocationFreshnessService.evaluateFreshness(cert1);
    const evalSibling = await RevocationFreshnessService.evaluateFreshness(cert2);

    expect(evalRevoked.outcome).toBe("REVOKED");
    expect(evalRevoked.isValid).toBe(false);
    expect(evalRevoked.isRevoked).toBe(true);
    expect(evalRevoked.snapshot.bitValue).toBe(1);

    // Sibling credential must remain completely unaffected and VALID_CURRENT
    expect(evalSibling.outcome).toBe("VALID_CURRENT");
    expect(evalSibling.isValid).toBe(true);
    expect(evalSibling.isRevoked).toBe(false);
    expect(evalSibling.snapshot.bitValue).toBe(0);

    // ------------------------------------------------------------------------
    // Step 4: Key Rotation Governance -> AUTHENTICITY_ONLY
    // ------------------------------------------------------------------------
    await KeyRepository.rotateKey(tenantId, `did:web:credvail.com:tenants:${tenantSlug}`);

    const evalRotated = await RevocationFreshnessService.evaluateFreshness(cert2);
    expect(evalRotated.outcome).toBe("AUTHENTICITY_ONLY");
    expect(evalRotated.isValid).toBe(true);
    expect(evalRotated.keyGovernance.keyStatus).toBe("ROTATED");

    // ------------------------------------------------------------------------
    // Step 5: Key Compromise Emergency Response (SEC-09) -> INVALID
    // ------------------------------------------------------------------------
    await KeyRepository.flagKeyCompromised(tenantId, 1);

    const evalCompromised1 = await RevocationFreshnessService.evaluateFreshness(cert1);
    const evalCompromised2 = await RevocationFreshnessService.evaluateFreshness(cert2);

    expect(evalCompromised1.outcome).toBe("INVALID");
    expect(evalCompromised1.isValid).toBe(false);
    expect(evalCompromised1.keyGovernance.isCompromised).toBe(true);

    expect(evalCompromised2.outcome).toBe("INVALID");
    expect(evalCompromised2.isValid).toBe(false);
    expect(evalCompromised2.keyGovernance.isCompromised).toBe(true);
  });
});
