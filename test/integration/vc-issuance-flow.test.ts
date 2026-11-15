import { describe, it, expect, beforeEach } from "vitest";
import { BatchRepository } from "@/lib/repositories/batch-repository";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { TemplateRepository } from "@/lib/repositories/template-repository";
import { TenantRepository } from "@/lib/repositories/tenant-repository";
import { KeyRepository } from "@/lib/repositories/key-repository";
import { KeyManagementService } from "@/lib/services/key-management-service";
import { BatchProcessingService } from "@/lib/services/batch-processing-service";
import { VcService, W3CVerifiableCredential } from "@/lib/crypto/vc-service";
import { SessionPayload } from "@/lib/auth/session";
import { TEMPLATE_PRESETS } from "@/lib/templates/presets";

describe("Phase 8: End-to-End W3C Verifiable Credential Issuance & Merkle Anchoring Flow", () => {
  const tenantRepo = new TenantRepository();
  const templateRepo = new TemplateRepository();

  let tenantA: any;
  let tenantB: any;
  let templateA: any;
  let ownerSessionA: SessionPayload;
  let ownerSessionB: SessionPayload;

  beforeEach(async () => {
    BatchRepository.resetInMemoryStore();
    CredentialRepository.resetInMemoryStore();
    TemplateRepository.resetInMemoryStore();
    KeyRepository.resetInMemoryStore();

    const slugA = `polytechnic-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    tenantA = await tenantRepo.createTenant({
      name: "National Polytechnic Institute",
      slug: slugA,
      legalEntityName: "National Polytechnic Institute Inc.",
      websiteUrl: `https://${slugA}.edu`,
      didUri: `did:web:credvail.com:tenants:${slugA}`,
      ownerUserId: "usr_poly_owner",
    });

    const slugB = `quantum-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    tenantB = await tenantRepo.createTenant({
      name: "Quantum Computing Labs",
      slug: slugB,
      legalEntityName: "Quantum Computing Labs LLC",
      websiteUrl: `https://${slugB}.edu`,
      didUri: `did:web:credvail.com:tenants:${slugB}`,
      ownerUserId: "usr_quantum_owner",
    });

    // Ensure active key epoch exists for tenant A
    await KeyManagementService.listKeys(tenantA.slug);
    await KeyManagementService.listKeys(tenantB.slug);

    ownerSessionA = {
      sub: "usr_poly_owner",
      email: "owner@polytechnic.edu",
      fullName: "Polytechnic Dean",
      platformRole: "USER",
      currentTenantId: tenantA.id,
      currentTenantRole: "ORG_OWNER",
      tenants: [{ tenantId: tenantA.id, slug: tenantA.slug, name: tenantA.name, role: "ORG_OWNER" }],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: "jti_poly_1",
    };

    ownerSessionB = {
      sub: "usr_quantum_owner",
      email: "owner@quantum.edu",
      fullName: "Quantum Director",
      platformRole: "USER",
      currentTenantId: tenantB.id,
      currentTenantRole: "ORG_OWNER",
      tenants: [{ tenantId: tenantB.id, slug: tenantB.slug, name: tenantB.name, role: "ORG_OWNER" }],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: "jti_quantum_1",
    };

    templateA = await templateRepo.createTemplate({
      tenantId: tenantA.id,
      title: "Master of Science in Distributed Systems",
      category: "COURSE_COMPLETION",
      description: "Graduate degree certificate with cryptographic Merkle proof",
      layoutConfig: TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig,
    });
  });

  it("should process a staged batch into signed W3C VCs with verified Merkle tree inclusion proofs", async () => {
    // 1. Stage a batch of 4 recipients
    const stagedBatch = await BatchRepository.createBatch({
      tenantId: tenantA.id,
      templateId: templateA.id,
      title: "Class of 2026 Distributed Systems",
      stagedRecipients: [
        {
          fullName: "Alice Turing",
          email: "alice@polytechnic.edu",
          status: "VALID",
          certificateNumberPreview: "POLY-2026-000001",
          courseName: "Distributed Systems & Merkle Trees",
          grade: "Summa Cum Laude",
          issueDate: "November 15, 2026",
          instructorName: "Prof. Satoshi Nakamoto",
        },
        {
          fullName: "Bob Rivest",
          email: "bob@polytechnic.edu",
          status: "VALID",
          certificateNumberPreview: "POLY-2026-000002",
          courseName: "Distributed Systems & Merkle Trees",
          grade: "Magna Cum Laude",
          issueDate: "November 15, 2026",
          instructorName: "Prof. Satoshi Nakamoto",
        },
        {
          fullName: "Carol Shamir",
          email: "carol@polytechnic.edu",
          status: "VALID",
          certificateNumberPreview: "POLY-2026-000003",
          courseName: "Distributed Systems & Merkle Trees",
          grade: "Cum Laude",
          issueDate: "November 15, 2026",
          instructorName: "Prof. Satoshi Nakamoto",
        },
        {
          fullName: "David Adleman",
          email: "david@polytechnic.edu",
          status: "VALID",
          certificateNumberPreview: "POLY-2026-000004",
          courseName: "Distributed Systems & Merkle Trees",
          grade: "Honors",
          issueDate: "November 15, 2026",
          instructorName: "Prof. Satoshi Nakamoto",
        },
      ],
    });

    // 2. Process batch: generates collision-safe cert numbers, signs VCs, computes Merkle tree
    const result = await BatchProcessingService.processBatch(
      tenantA.slug,
      stagedBatch.id,
      ownerSessionA
    );

    // Verify batch processing outcome
    expect(result.status).toBe("GENERATED");
    expect(result.totalProcessed).toBe(4);
    expect(result.merkleRoot).toBeDefined();
    expect(result.merkleRoot?.startsWith("0x")).toBe(true);
    expect(result.merkleRoot?.length).toBe(66);
    expect(result.credentials.length).toBe(4);

    // 3. Verify Batch record updated with Merkle Root
    const updatedBatch = await BatchRepository.findBatchById(tenantA.id, stagedBatch.id);
    expect(updatedBatch?.status).toBe("GENERATED");
    expect(updatedBatch?.merkleRoot).toBe(result.merkleRoot);

    // 4. Retrieve Active Signing Key for signature verification
    const { key: activeKey } = await KeyManagementService.getActiveSigningKey(tenantA.slug, ownerSessionA);

    // 5. Verify every issued credential individually
    for (let i = 0; i < result.credentials.length; i++) {
      const credSummary = result.credentials[i];

      const credRecord = await CredentialRepository.findCredentialById(tenantA.id, credSummary.id);
      expect(credRecord).toBeDefined();
      expect(credRecord?.merkleIndex).toBe(i);
      expect(credRecord?.leafHash).toBe(credSummary.leafHash);

      // Verify W3C Verifiable Credential structure
      const vc = credRecord?.vcPayloadJson as unknown as W3CVerifiableCredential;
      expect(vc["@context"]).toContain("https://www.w3.org/ns/credentials/v2");
      expect(vc.id).toBe(credSummary.credentialId);
      expect(vc.issuer.id).toBe(tenantA.didUri);
      expect(vc.proof?.type).toBe("JsonWebSignature2020");
      expect(vc.proof?.verificationMethod).toBe(activeKey.keyIdentifier);

      // Verify digital signature against tenant's public key PEM
      const isSigValid = VcService.verifyCredentialSignature(vc, activeKey.publicKeyPem);
      expect(isSigValid).toBe(true);

      // Verify digital signature against tenant's public key JWK
      const isJwkSigValid = VcService.verifyCredentialSignature(vc, activeKey.publicKeyJwk);
      expect(isJwkSigValid).toBe(true);

      // Verify Merkle Inclusion Proof
      const proof = await CredentialRepository.getMerkleProof(tenantA.id, credSummary.id);
      expect(proof).toBeDefined();
      expect(proof?.root).toBe(result.merkleRoot);
      expect(proof?.leafHash).toBe(credSummary.leafHash);
      expect(proof?.index).toBe(i);
      expect(proof?.totalLeaves).toBe(4);

      // Verify cryptographic inclusion path
      const isProofValid = VcService.verifyMerkleProof(proof!.leafHash, proof!.proof, proof!.root);
      expect(isProofValid).toBe(true);

      // Verify evidence block in W3C VC
      expect(vc.evidence).toBeDefined();
      expect(vc.evidence?.[0].merkleRoot).toBe(result.merkleRoot);
      expect(vc.evidence?.[0].leafHash).toBe(credSummary.leafHash);
    }

    // 6. Verify Tamper Rejection: Altering a claim statement breaks signature verification
    const firstCred = await CredentialRepository.findCredentialById(tenantA.id, result.credentials[0].id);
    const tamperedVc = JSON.parse(JSON.stringify(firstCred?.vcPayloadJson)) as W3CVerifiableCredential;
    tamperedVc.credentialSubject.claims["grade"] = "F";

    const isTamperedSigValid = VcService.verifyCredentialSignature(tamperedVc, activeKey.publicKeyPem);
    expect(isTamperedSigValid).toBe(false);

    // 7. Verify Cross-Tenant Isolation Barrier
    // Owner of Tenant B cannot retrieve Tenant A's Merkle proofs
    const proofForB = await CredentialRepository.getMerkleProof(tenantB.id, result.credentials[0].id);
    expect(proofForB).toBeNull();

    // Owner of Tenant B cannot process Tenant A's batches
    await expect(
      BatchProcessingService.processBatch(tenantA.slug, stagedBatch.id, ownerSessionB)
    ).rejects.toThrow(/Forbidden/);

    // 8. Verify Audit Log was recorded
    const auditLogs = await tenantRepo.listAuditLogs(tenantA.id);
    const processLog = auditLogs.find((l) => l.action === "BATCH_PROCESSED");
    expect(processLog).toBeDefined();
    expect(processLog?.metadata.merkleRoot).toBe(result.merkleRoot);
    expect(processLog?.metadata.totalGenerated).toBe(4);
  });
});
