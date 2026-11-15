import { describe, it, expect, beforeEach } from "vitest";
import { VerificationService } from "@/lib/services/verification-service";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { TenantRepository } from "@/lib/repositories/tenant-repository";
import { BatchRepository } from "@/lib/repositories/batch-repository";
import { KeyRepository } from "@/lib/repositories/key-repository";
import { KeyManagementService } from "@/lib/services/key-management-service";
import { BatchProcessingService } from "@/lib/services/batch-processing-service";
import { BlockchainService } from "@/lib/blockchain/blockchain-service";
import { TemplateRepository } from "@/lib/repositories/template-repository";
import { TEMPLATE_PRESETS } from "@/lib/templates/presets";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

describe("Phase 10: End-to-End Public Verification Engine Flow", () => {
  const tenantSlug = "stanford-e2e";
  let tenantId: string;
  let tenantDid: string;
  let ownerToken: string;
  let outsiderToken: string;
  let templateId: string;
  let batchId: string;

  beforeEach(async () => {
    CredentialRepository.resetInMemoryStore();
    BlockchainService.resetSimulatedState();
    KeyRepository.resetInMemoryStore();

    const tenantRepo = new TenantRepository();
    const ownerUserId = "usr_owner_stanford";

    let tenant = await tenantRepo.findBySlug(tenantSlug);
    if (!tenant) {
      tenant = await tenantRepo.createTenant({
        slug: tenantSlug,
        name: "Stanford University School of Engineering",
        legalEntityName: "The Board of Trustees of the Leland Stanford Junior University",
        websiteUrl: "https://engineering.stanford.edu",
        didUri: `did:web:credvail.com:tenants:${tenantSlug}`,
        ownerUserId,
      });
    }
    tenantId = tenant.id;
    tenantDid = tenant.didUri;

    // Generate authenticated session cookies
    ownerToken = createSessionToken({
      id: ownerUserId,
      email: "dean@stanford.edu",
      fullName: "Dean Stanford",
      platformRole: "USER",
      memberships: [
        {
          tenantId,
          role: "ORG_OWNER",
          tenant: {
            slug: tenantSlug,
            name: tenant.name,
          },
        },
      ],
    });

    outsiderToken = createSessionToken({
      id: "usr_attacker",
      email: "intruder@other.edu",
      fullName: "Malicious Intruder",
      platformRole: "USER",
      memberships: [
        {
          tenantId: "tnt_other",
          role: "READ_ONLY_STAFF",
          tenant: {
            slug: "other-univ",
            name: "Other University",
          },
        },
      ],
    });

    // Initialize institutional key epoch 1
    await KeyRepository.getOrCreateInitialKey(tenantId, tenantDid);

    // Seed certificate template
    const templateRepo = new TemplateRepository();
    const preset = TEMPLATE_PRESETS.COURSE_COMPLETION;
    const template = await templateRepo.createTemplate({
      tenantId,
      title: "Stanford Executive AI Leadership Certificate",
      category: "COURSE_COMPLETION",
      description: "Official credential for completing executive AI systems governance.",
      layoutConfig: preset.layoutConfig,
    });
    templateId = template.id;

    // Stage batch of 2 recipients
    const batch = await BatchRepository.createBatch({
      tenantId,
      templateId,
      title: "Executive AI Cohort 2026",
      stagedRecipients: [
        {
          fullName: "Dr. Evelyn Reed",
          email: "evelyn.reed@stanford.edu",
          certificateNumberPreview: "STAN-2026-000001",
          courseName: "Executive AI Systems Governance",
          issueDate: "2026-11-15",
          grade: "With Distinction",
          status: "VALID",
        },
        {
          fullName: "Marcus Vance",
          email: "m.vance@stanford.edu",
          certificateNumberPreview: "STAN-2026-000002",
          courseName: "Executive AI Systems Governance",
          issueDate: "2026-11-15",
          grade: "Pass",
          status: "VALID",
        },
      ],
    });
    batchId = batch.id;
  });

  it("completes full lifecycle: batch processing, Sepolia anchoring, public QR lookup, and instant revocation detection", async () => {
    // 1. Process batch: generates collision-safe certs, vector PDFs, QR codes, signed W3C VCs, and Merkle tree
    const session = verifySessionToken(ownerToken)!;
    const processResult = await BatchProcessingService.processBatch(
      tenantSlug,
      batchId,
      session,
      "https://credvail.com"
    );

    expect(processResult.status).toBe("GENERATED");
    expect(processResult.totalProcessed).toBe(2);
    expect(processResult.merkleRoot).toMatch(/^0x[0-9a-fA-F]{64}$/);

    // 2. Anchor batch Merkle root to Ethereum Sepolia smart contract
    const anchorReceipt = await BlockchainService.anchorBatch(
      tenantSlug,
      batchId,
      processResult.merkleRoot!,
      2
    );

    expect(anchorReceipt.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(Number(anchorReceipt.blockNumber)).toBeGreaterThan(0);
    expect(anchorReceipt.explorerUrl).toContain("etherscan.io");

    await BatchRepository.updateBatchStatus(tenantId, batchId, "GENERATED", {
      merkleRoot: processResult.merkleRoot,
      onChainTxHash: anchorReceipt.txHash,
      blockchainBlockNumber: anchorReceipt.blockNumber,
    });

    // 3. Verify public lookup via Certificate Number
    const certNumber1 = processResult.credentials[0].certificateNumber;
    const certNumber2 = processResult.credentials[1].certificateNumber;
    const publicResult = await VerificationService.verifyByPublicId(certNumber1);

    expect(publicResult.status).toBe("VALID");
    expect(publicResult.isValid).toBe(true);
    expect(publicResult.credential.recipientName).toBe("Dr. Evelyn Reed");
    expect(publicResult.credential.certificateNumber).toBe(certNumber1);
    expect(publicResult.issuer.slug).toBe(tenantSlug);
    expect(publicResult.issuer.isTrustVerified).toBe(true);
    expect(publicResult.cryptography.signatureValid).toBe(true);
    expect(publicResult.cryptography.canonicalHashMatches).toBe(true);
    expect(publicResult.cryptography.merkleProofValid).toBe(true);
    expect(publicResult.blockchain.anchored).toBe(true);
    expect(publicResult.blockchain.network).toBe("Ethereum Sepolia");
    expect(publicResult.blockchain.contractAddress).toBe(BlockchainService.getContractAddress());
    expect(publicResult.verificationLatencyMs).toBeLessThan(250);

    // 4. Verify public lookup via raw UUID (simulating QR scan target)
    const rawUuid = publicResult.credential.id.replace("urn:uuid:", "");
    const qrLookupResult = await VerificationService.verifyByPublicId(rawUuid);

    expect(qrLookupResult.status).toBe("VALID");
    expect(qrLookupResult.isValid).toBe(true);
    expect(qrLookupResult.credential.certificateNumber).toBe(certNumber1);

    // 5. Test raw PDF binary availability for public download
    const credRecord = await CredentialRepository.findCredentialByPublicId(certNumber1);
    expect(credRecord).not.toBeNull();

    const pdfBuffer = CredentialRepository.getPdfBuffer(credRecord!.id);
    expect(pdfBuffer).not.toBeNull();
    // Validate standard %PDF-1. header
    const pdfHeader = Buffer.from(pdfBuffer!.slice(0, 5)).toString("utf8");
    expect(pdfHeader).toBe("%PDF-");

    // 6. Execute credential revocation (e.g. academic annulment)
    const revokeReason = "Honor council inquiry findings";
    const revoked = await CredentialRepository.revokeCredential(tenantId, credRecord!.id, revokeReason);
    expect(revoked).not.toBeNull();
    expect(revoked?.state).toBe("REVOKED");

    // 7. Verify that public lookup IMMEDIATELY reflects REVOKED status (Metric M6: < 1.0s)
    const revokedLookup = await VerificationService.verifyByPublicId(certNumber1);

    expect(revokedLookup.isValid).toBe(false);
    expect(revokedLookup.status).toBe("REVOKED");
    expect(revokedLookup.credential.state).toBe("REVOKED");
    expect(revokedLookup.warnings?.some((w) => w.includes(revokeReason))).toBe(true);

    const revCheck = revokedLookup.checks.find((c) => c.code === "REVOCATION_STATUS");
    expect(revCheck?.passed).toBe(false);

    // 8. Verify that recipient #2 remains completely unaffected and VALID
    const cert2Result = await VerificationService.verifyByPublicId(certNumber2);
    expect(cert2Result.status).toBe("VALID");
    expect(cert2Result.isValid).toBe(true);
    expect(cert2Result.credential.recipientName).toBe("Marcus Vance");
  });
});
