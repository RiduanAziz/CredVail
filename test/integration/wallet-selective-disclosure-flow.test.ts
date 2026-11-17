import { describe, it, expect, beforeEach } from "vitest";
import { WalletService } from "@/lib/wallet/wallet-service";
import { TenantRepository, inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { CredentialRepository } from "@/lib/repositories/credential-repository";

describe("Phase 11 security gate: wallet does not issue non-standard selective presentations", () => {
  const tenantSlug = "selective-security-tenant";
  const holderId = "holder_selective_security";
  const certificateNumber = "CREDVAIL-SD-SEC-001";
  const recipientEmail = "holder@example.test";

  beforeEach(async () => {
    WalletService.resetInMemoryStore();
    CredentialRepository.resetInMemoryStore();
    inMemoryTenantStore.clear();

    const tenantRepo = new TenantRepository();
    const tenant = await tenantRepo.createTenant({
      slug: tenantSlug,
      name: "Selective Security Test Institution",
      legalEntityName: "Selective Security Test Institution",
      websiteUrl: "https://issuer.example.test",
      didUri: "did:web:issuer.example.test",
      ownerUserId: "user_selective_security",
    });

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:selective-security-001",
      certificateNumber,
      tenantId: tenant.id,
      batchId: "batch-selective-security",
      recipientName: "Example Holder",
      recipientEmail,
      leafHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: { course_name: "Security Engineering", grade: "A" },
      vcPayloadJson: { id: "urn:uuid:selective-security-001" },
    });
  });

  it("allows credential claiming but does not generate legacy disclosure tokens", async () => {
    const claimed = await WalletService.claimCredential(
      { certificateNumber, recipientEmail },
      holderId
    );

    expect(claimed.certificateNumber).toBe(certificateNumber);
    expect(claimed.claims.course_name).toBe("Security Engineering");
    expect(claimed.disclosures).toEqual({});
  });

  it("rejects selective presentation generation until the W3C cryptosuite is integrated", async () => {
    await WalletService.claimCredential(
      { certificateNumber, recipientEmail },
      holderId
    );

    expect(() =>
      WalletService.createSelectivePresentation(
        certificateNumber,
        ["course_name"],
        "cn_test",
        "https://verifier.example.test",
        holderId
      )
    ).toThrow(/disabled/i);
  });
});
