import { describe, it, expect, beforeEach } from "vitest";
import { TenantRepository } from "@/lib/repositories/tenant-repository";
import { TemplateRepository } from "@/lib/repositories/template-repository";
import { BatchRepository } from "@/lib/repositories/batch-repository";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { KeyRepository } from "@/lib/repositories/key-repository";
import { KeyManagementService } from "@/lib/services/key-management-service";
import { BatchProcessingService } from "@/lib/services/batch-processing-service";
import { BlockchainService } from "@/lib/blockchain/blockchain-service";
import { TEMPLATE_PRESETS } from "@/lib/templates/presets";

describe("Phase 9: End-to-End Blockchain Integration Flow", () => {
  const tenantRepo = new TenantRepository();
  const slug = "caltech-crypto-lab";

  beforeEach(() => {
    TemplateRepository.resetInMemoryStore();
    BatchRepository.resetInMemoryStore();
    CredentialRepository.resetInMemoryStore();
    KeyRepository.resetInMemoryStore();
    BlockchainService.resetSimulatedState();
  });

  it("completes full lifecycle: key epoch registration, batch processing, Sepolia anchoring, and on-chain Merkle proof verification", async () => {
    // 1. Create institution
    const tenant = await tenantRepo.createTenant({
      name: "California Institute of Technology - Cryptography Laboratory",
      slug,
      legalEntityName: "Caltech Crypto Lab",
      websiteUrl: "https://crypto.caltech.edu",
      didUri: `did:web:credvail.com:tenants:${slug}`,
      ownerUserId: "user_feynman",
    });
    expect(tenant.id).toBeDefined();

    // 2. Provision initial Key Epoch 1 and register on-chain
    const activeKey = await KeyRepository.getOrCreateInitialKey(tenant.id, tenant.didUri);
    expect(activeKey.keyEpoch).toBe(1);

    const onChainKeyReg = await BlockchainService.registerIssuerKey(
      slug,
      activeKey.keyEpoch,
      activeKey.fingerprint
    );
    expect(onChainKeyReg.txHash.startsWith("0x")).toBe(true);

    const verifiedKey = await BlockchainService.getIssuerKey(slug, 1);
    expect(verifiedKey?.exists).toBe(true);
    expect(verifiedKey?.isCompromised).toBe(false);

    // 3. Create Certificate Template
    const templateRepo = new TemplateRepository();
    const template = await templateRepo.createTemplate({
      tenantId: tenant.id,
      title: "Quantum Cryptography Master Certification",
      category: "COURSE_COMPLETION",
      description: "Certification",
      layoutConfig: TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig,
    });
    expect(template.id).toBeDefined();

    // 4. Stage Ingestion Batch with 3 Recipients
    const stagedBatch = await BatchRepository.createBatch({
      tenantId: tenant.id,
      templateId: template.id,
      title: "Class of 2026 Honors Cohort",
      stagedRecipients: [
        {
          fullName: "Richard Feynman",
          email: "feynman@caltech.edu",
          certificateNumberPreview: "CALTECH-2026-0001",
          courseName: "Quantum Computing & Information",
          issueDate: "2026-11-15",
          grade: "Summa Cum Laude",
          status: "VALID",
        },
        {
          fullName: "Murray Gell-Mann",
          email: "gellmann@caltech.edu",
          certificateNumberPreview: "CALTECH-2026-0002",
          courseName: "Quark Model & Quantum Chromodynamics",
          issueDate: "2026-11-15",
          grade: "Honors",
          status: "VALID",
        },
        {
          fullName: "Kip Thorne",
          email: "thorne@caltech.edu",
          certificateNumberPreview: "CALTECH-2026-0003",
          courseName: "Gravitational Waves & Relativity",
          issueDate: "2026-11-15",
          grade: "Distinction",
          status: "VALID",
        },
      ],
    });
    expect(stagedBatch.status).toBe("DRAFT");
    expect(stagedBatch.validCount).toBe(3);

    // 5. Process Batch (render PDFs, sign W3C VCs, compute Merkle root & proofs)
    const processedResult = await BatchProcessingService.processBatch(
      slug,
      stagedBatch.id,
      {
        sub: "user_feynman_admin",
        email: "admin@crypto.caltech.edu",
        platformRole: "USER",
        tenants: [{ tenantId: tenant.id, slug, role: "ORG_OWNER" }],
      } as any
    );

    expect(processedResult.status).toBe("GENERATED");
    expect(processedResult.totalProcessed).toBe(3);
    expect(processedResult.merkleRoot).toBeDefined();

    const rootHash = processedResult.merkleRoot!;
    expect(rootHash.startsWith("0x")).toBe(true);

    // 6. Anchor Batch to Ethereum Sepolia via BlockchainService
    const anchorTx = await BlockchainService.anchorBatch(slug, stagedBatch.id, rootHash, 3);
    expect(anchorTx.txHash.startsWith("0x")).toBe(true);
    expect(anchorTx.blockNumber).toBeGreaterThan(0);
    expect(anchorTx.explorerUrl).toContain("sepolia.etherscan.io");

    // Update batch in repository
    const updatedBatch = await BatchRepository.updateBatchStatus(tenant.id, stagedBatch.id, "ANCHORED", {
      onChainTxHash: anchorTx.txHash,
      blockchainBlockNumber: anchorTx.blockNumber,
    });
    expect(updatedBatch?.status).toBe("ANCHORED");
    expect(updatedBatch?.onChainTxHash).toBe(anchorTx.txHash);

    // Verify on-chain record directly from the contract
    const onChainBatch = await BlockchainService.getBatch(slug, stagedBatch.id);
    expect(onChainBatch?.exists).toBe(true);
    expect(onChainBatch?.leafCount).toBe(3);
    expect(onChainBatch?.merkleRoot.toLowerCase()).toBe(rootHash.toLowerCase());

    // 7. Verify Each Credential's Inclusion Proof Directly Against Sepolia Smart Contract
    const { items: credentials } = await CredentialRepository.listCredentials(tenant.id, {
      batchId: stagedBatch.id,
    });
    expect(credentials.length).toBe(3);

    for (const cred of credentials) {
      const proofRecord = await CredentialRepository.getMerkleProof(tenant.id, cred.id);
      expect(proofRecord).not.toBeNull();
      expect(proofRecord?.root.toLowerCase()).toBe(rootHash.toLowerCase());

      // Query on-chain smart contract
      const isVerified = await BlockchainService.verifyCredentialProof(
        slug,
        stagedBatch.id,
        cred.leafHash,
        proofRecord!.proof
      );
      expect(isVerified).toBe(true);
    }

    // 8. Test Tampered Credential Rejection On-Chain
    const tamperedLeaf = "0x" + "bad".repeat(21) + "0";
    const proof0 = (await CredentialRepository.getMerkleProof(tenant.id, credentials[0].id))!.proof;
    const isFakeVerified = await BlockchainService.verifyCredentialProof(
      slug,
      stagedBatch.id,
      tamperedLeaf,
      proof0
    );
    expect(isFakeVerified).toBe(false);

    // 9. Rotate Key Epoch on-chain (Epoch 1 -> Epoch 2)
    const rotatedKey = await KeyManagementService.rotateKey(slug, {
      sub: "user_feynman_admin",
      email: "admin@crypto.caltech.edu",
      platformRole: "USER",
      tenants: [{ tenantId: tenant.id, slug, role: "ORG_OWNER" }],
    } as any);

    expect(rotatedKey.keyEpoch).toBe(2);
    expect(rotatedKey.onChainTxHash).toBeDefined();

    const onChainKey2 = await BlockchainService.getIssuerKey(slug, 2);
    expect(onChainKey2?.exists).toBe(true);
    expect(onChainKey2?.publicKeyFingerprint.toLowerCase()).toBe(
      rotatedKey.fingerprint.startsWith("0x")
        ? rotatedKey.fingerprint.toLowerCase()
        : ("0x" + rotatedKey.fingerprint).toLowerCase()
    );

    // 10. Emergency Compromise Flagging on-chain
    const compromisedKey = await KeyManagementService.flagCompromised(slug, 1, {
      sub: "user_feynman_admin",
      email: "admin@crypto.caltech.edu",
      platformRole: "USER",
      tenants: [{ tenantId: tenant.id, slug, role: "ORG_OWNER" }],
    } as any);

    expect(compromisedKey.isCompromised).toBe(true);

    const onChainCompKey = await BlockchainService.getIssuerKey(slug, 1);
    expect(onChainCompKey?.isCompromised).toBe(true);
    expect(onChainCompKey?.compromisedAt).toBeGreaterThan(0);
  });
});
