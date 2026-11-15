import { describe, it, expect, beforeEach } from "vitest";
import { WalletService } from "@/lib/wallet/wallet-service";
import { VerificationService } from "@/lib/services/verification-service";
import { SelectiveDisclosureEngine } from "@/lib/crypto/selective-disclosure";
import { TenantRepository, inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { TemplateRepository } from "@/lib/repositories/template-repository";
import { BatchRepository } from "@/lib/repositories/batch-repository";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { KeyRepository } from "@/lib/repositories/key-repository";
import { KeyService } from "@/lib/crypto/key-service";
import { VcService } from "@/lib/crypto/vc-service";
import { BlockchainService } from "@/lib/blockchain/blockchain-service";
import { TEMPLATE_PRESETS } from "@/lib/templates/presets";

describe("Phase 11: End-to-End Wallet Claiming & Selective Disclosure Flow", () => {
  let tenantId = "ten_flow_001";
  const tenantSlug = "stanford-engineering";
  const holderId = "holder_student_flow";
  const certificateNumber = "STANFORD-2026-9001";
  const recipientEmail = "elizabeth@stanford.edu";
  const recipientName = "Elizabeth Z. Hopper";

  beforeEach(async () => {
    WalletService.resetInMemoryStore();
    CredentialRepository.resetInMemoryStore();
    inMemoryTenantStore.clear();
    TemplateRepository.resetInMemoryStore();
    BatchRepository.resetInMemoryStore();
    KeyRepository.resetInMemoryStore();

    // 1. Provision Institutional Tenant & Key
    const tenantRepo = new TenantRepository();
    const createdTenant = await tenantRepo.createTenant({
      slug: tenantSlug,
      name: "Stanford School of Engineering",
      legalEntityName: "Leland Stanford Junior University",
      websiteUrl: "https://engineering.stanford.edu",
      didUri: `did:web:credvail.com:tenants:${tenantSlug}`,
      ownerUserId: "usr_stanford_provost",
    });
    tenantId = createdTenant.id;

    const issuerKey = await KeyRepository.getOrCreateInitialKey(
      tenantId,
      `did:web:credvail.com:tenants:${tenantSlug}`
    );
    const issuerPrivateKeyPem = KeyService.decryptPrivateKey(issuerKey.encryptedPrivateKey!);

    // 2. Create Certificate Template & Batch
    const templateRepo = new TemplateRepository();
    const template = await templateRepo.createTemplate({
      tenantId,
      title: "Master of Science in Distributed Systems",
      category: "COURSE_COMPLETION",
      layoutConfig: TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig,
    });

    const fullClaims = {
      degree_level: "Master of Science",
      program_name: "Distributed Systems & Applied Cryptography",
      final_gpa: "3.98 / 4.00",
      academic_honors: "Summa Cum Laude",
      advisor_name: "Prof. Whitfield Diffie",
      conferral_date: "2026-06-15",
    };

    const batch = await BatchRepository.createBatch({
      tenantId,
      templateId: template.id,
      title: "2026 Graduate Commencement",
      stagedRecipients: [
        {
          fullName: recipientName,
          email: recipientEmail,
          certificateNumberPreview: certificateNumber,
          issueDate: "2026-06-15",
          customData: fullClaims,
          status: "VALID",
        },
      ],
    });

    // 3. Issue and Sign Credential
    const unsignedVc = VcService.buildUnsignedCredential({
      credentialId: "urn:uuid:stanford-grad-001",
      certificateNumber,
      tenantDidUri: `did:web:credvail.com:tenants:${tenantSlug}`,
      tenantName: "Stanford School of Engineering",
      tenantSlug,
      recipientId: "rec_hopper_001",
      recipientName,
      recipientEmail,
      claims: fullClaims,
      batchId: batch.id,
      merkleIndex: 0,
      bitstringIndex: 0,
    });

    const signedVc = VcService.signCredential(
      unsignedVc,
      issuerPrivateKeyPem,
      `did:web:credvail.com:tenants:${tenantSlug}#key-1`
    );

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:stanford-grad-001",
      certificateNumber,
      tenantId,
      batchId: batch.id,
      recipientName,
      recipientEmail,
      leafHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: fullClaims,
      vcPayloadJson: signedVc as any,
    });
  });

  it("executes full lifecycle: issuance -> wallet claim -> selective disclosure -> verifier evaluation", async () => {
    // Step 1: Holder Claims Credential into Local Vault
    const claimed = await WalletService.claimCredential(
      { certificateNumber, recipientEmail },
      holderId
    );
    expect(claimed.certificateNumber).toBe(certificateNumber);
    expect(claimed.recipientEmail).toBe(recipientEmail);
    expect(Object.keys(claimed.disclosures).length).toBe(6);

    // Step 2: Verifier generates challenge nonce
    const challengeNonce = VerificationService.generateChallengeNonce(300);
    expect(challengeNonce).toMatch(/^cn_/);

    // Step 3: Holder consents to disclose ONLY degree_level and program_name (blinds GPA, honors, advisor)
    const disclosedKeys = ["degree_level", "program_name"];
    const presentationResult = WalletService.createSelectivePresentation(
      certificateNumber,
      disclosedKeys,
      challengeNonce,
      "employer-verifier.io",
      holderId
    );

    // Step 4: Empirical Metric M2 Verification (>= 40% reduction)
    expect(presentationResult.wireSizeReductionPercent).toBeGreaterThanOrEqual(40);
    expect(presentationResult.undisclosedCount).toBe(4);
    expect(presentationResult.disclosedClaims).toEqual({
      degree_level: "Master of Science",
      program_name: "Distributed Systems & Applied Cryptography",
    });

    // Step 5: Verifier Evaluates Presentation
    const verifyResult = await VerificationService.verifyPresentation(
      presentationResult.presentation,
      challengeNonce
    );

    // Presentation must be cryptographically valid
    expect(verifyResult.isValid).toBe(true);
    expect(verifyResult.status).toBe("VALID");

    // Verifier checks include replay nonce and selective disclosure privacy
    const nonceCheck = verifyResult.checks.find((c) => c.code === "CHALLENGE_NONCE_VERIFICATION");
    expect(nonceCheck?.passed).toBe(true);

    const privacyCheck = verifyResult.checks.find((c) => c.code === "SELECTIVE_DISCLOSURE_PRIVACY");
    expect(privacyCheck?.passed).toBe(true);
    expect(privacyCheck?.details?.piiBlinded).toBe(true);

    // Step 6: Verify Verifier DID NOT Learn Blinded Sensitive Attributes
    const revealedSubject = (presentationResult.presentation.verifiableCredential[0] as any).credentialSubject;
    expect(revealedSubject.final_gpa).toBeUndefined();
    expect(revealedSubject.academic_honors).toBeUndefined();
    expect(revealedSubject.advisor_name).toBeUndefined();

    // Step 7: Anti-Replay Defense: Re-submitting the same nonce fails
    const replayedResult = await VerificationService.verifyPresentation(
      presentationResult.presentation,
      challengeNonce
    );
    expect(replayedResult.isValid).toBe(false);
    const replayedNonceCheck = replayedResult.checks.find((c) => c.code === "CHALLENGE_NONCE_VERIFICATION");
    expect(replayedNonceCheck?.passed).toBe(false);
  });
});
