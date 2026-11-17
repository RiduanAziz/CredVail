import { describe, it, expect, beforeEach } from "vitest";
import { WalletService } from "@/lib/wallet/wallet-service";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { TenantRepository, inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { TemplateRepository } from "@/lib/repositories/template-repository";
import { BatchRepository } from "@/lib/repositories/batch-repository";
import { KeyRepository } from "@/lib/repositories/key-repository";
import { KeyService } from "@/lib/crypto/key-service";
import { VcService } from "@/lib/crypto/vc-service";
import { TEMPLATE_PRESETS } from "@/lib/templates/presets";

describe("Phase 11: Holder Wallet & Client Vault Unit Tests", () => {
  let tenantId = "ten_wallet_test_001";
  const tenantSlug = "wallet-test-academy";
  const holderId = "holder_student_01";
  const testCertNumber = "WLT-2026-8888";
  const studentEmail = "student@wallet.test";

  beforeEach(async () => {
    WalletService.resetInMemoryStore();
    CredentialRepository.resetInMemoryStore();
    inMemoryTenantStore.clear();
    TemplateRepository.resetInMemoryStore();
    BatchRepository.resetInMemoryStore();
    KeyRepository.resetInMemoryStore();

    // Setup tenant, key epoch, and template
    const tenantRepo = new TenantRepository();
    const createdTenant = await tenantRepo.createTenant({
      slug: tenantSlug,
      name: "Wallet Test Academy",
      legalEntityName: "Wallet Test Academy Inc",
      websiteUrl: "https://wallet-test.edu",
      didUri: `did:web:credvail.com:tenants:${tenantSlug}`,
      ownerUserId: "usr_owner_wallet",
    });
    tenantId = createdTenant.id;

    const issuerKey = await KeyRepository.getOrCreateInitialKey(
      tenantId,
      `did:web:credvail.com:tenants:${tenantSlug}`
    );
    const issuerPrivateKeyPem = KeyService.decryptPrivateKey(issuerKey.encryptedPrivateKey!);

    const templateRepo = new TemplateRepository();
    const template = await templateRepo.createTemplate({
      tenantId,
      title: "Wallet Test Certificate",
      category: "COURSE_COMPLETION",
      layoutConfig: TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig,
    });

    const batch = await BatchRepository.createBatch({
      tenantId,
      templateId: template.id,
      title: "Batch Wallet Test",
      stagedRecipients: [
        {
          fullName: "Alice Student",
          email: studentEmail,
          certificateNumberPreview: testCertNumber,
          issueDate: "2026-11-15",
          status: "VALID",
        },
      ],
    });

    // Create an issued credential in repository
    const unsignedVc = VcService.buildUnsignedCredential({
      credentialId: "urn:uuid:cred-wallet-001",
      certificateNumber: testCertNumber,
      tenantDidUri: `did:web:credvail.com:tenants:${tenantSlug}`,
      tenantName: "Wallet Test Academy",
      tenantSlug,
      recipientId: "rec_student_01",
      recipientName: "Alice Student",
      recipientEmail: studentEmail,
      claims: {
        course_name: "Advanced Applied Cryptography",
        grade: "Distinction",
        instructor_name: "Dr. Satoshi",
      },
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
      credentialId: "urn:uuid:cred-wallet-001",
      certificateNumber: testCertNumber,
      tenantId,
      batchId: batch.id,
      recipientName: "Alice Student",
      recipientEmail: studentEmail,
      leafHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: {
        course_name: "Advanced Applied Cryptography",
        grade: "Distinction",
        instructor_name: "Dr. Satoshi",
      },
      vcPayloadJson: signedVc as any,
    });
  });

  it("1. generates deterministic holder identity with ECDSA P-256 key and did:key format", () => {
    const id1 = WalletService.getOrCreateHolderIdentity(holderId);
    expect(id1.holderId).toBe(holderId);
    expect(id1.did).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
    expect(id1.keyPair.publicKeyPem).toContain("BEGIN PUBLIC KEY");
    expect(id1.keyPair.privateKeyPem).toContain("BEGIN PRIVATE KEY");

    // Idempotency: subsequent call returns identical identity
    const id2 = WalletService.getOrCreateHolderIdentity(holderId);
    expect(id2.did).toBe(id1.did);
    expect(id2.keyPair.publicKeyMultibase).toBe(id1.keyPair.publicKeyMultibase);
  });

  it("2. claims issued credential by verifying recipient email and stores salted disclosures in vault", async () => {
    const claimed = await WalletService.claimCredential(
      { certificateNumber: testCertNumber, recipientEmail: studentEmail },
      holderId
    );

    expect(claimed.certificateNumber).toBe(testCertNumber);
    expect(claimed.recipientEmail).toBe(studentEmail);
    expect(claimed.recipientName).toBe("Alice Student");
    expect(claimed.disclosures).toBeDefined();

    // Assert each claim has an independent salt and disclosure token
    expect(claimed.disclosures.course_name).toBeDefined();
    expect(claimed.disclosures.course_name.value).toBe("Advanced Applied Cryptography");
    expect(claimed.disclosures.course_name.salt).toBeDefined();
    expect(claimed.disclosures.grade.value).toBe("Distinction");

    // Check credential is in vault
    const inVault = WalletService.getCredential(testCertNumber, holderId);
    expect(inVault).not.toBeNull();
    expect(inVault?.credentialId).toBe(claimed.credentialId);
  });

  it("3. rejects claiming with non-existent certificate number", async () => {
    await expect(
      WalletService.claimCredential(
        { certificateNumber: "NON-EXISTENT-CERT", recipientEmail: studentEmail },
        holderId
      )
    ).rejects.toThrow("not found");
  });

  it("4. rejects claiming when recipient email does not match credential subject (identity binding)", async () => {
    await expect(
      WalletService.claimCredential(
        { certificateNumber: testCertNumber, recipientEmail: "imposter@malicious.com" },
        holderId
      )
    ).rejects.toThrow("Email verification failed");
  });

  it("5. lists and retrieves credentials, and deletes credential on holder request", async () => {
    await WalletService.claimCredential(
      { certificateNumber: testCertNumber, recipientEmail: studentEmail },
      holderId
    );

    const list = WalletService.listCredentials(holderId);
    expect(list.length).toBe(1);
    expect(list[0].certificateNumber).toBe(testCertNumber);

    const retrieved = WalletService.getCredential(testCertNumber, holderId);
    expect(retrieved?.certificateNumber).toBe(testCertNumber);

    const deleted = WalletService.deleteCredential(testCertNumber, holderId);
    expect(deleted).toBe(true);

    const afterDelete = WalletService.getCredential(testCertNumber, holderId);
    expect(afterDelete).toBeNull();

    const emptyList = WalletService.listCredentials(holderId);
    expect(emptyList.length).toBe(0);
  });

  it("6. refuses to create a presentation with the legacy custom disclosure format", async () => {
    await WalletService.claimCredential(
      { certificateNumber: testCertNumber, recipientEmail: studentEmail },
      holderId
    );

    expect(() =>
      WalletService.createSelectivePresentation(
        testCertNumber,
        ["course_name"],
        "verifier_challenge_nonce_999",
        "https://verifier.example.test",
        holderId
      )
    ).toThrow(/disabled/i);
  });

  it("7. exports AES-256-GCM encrypted vault backup and imports cleanly into new session", async () => {
    await WalletService.claimCredential(
      { certificateNumber: testCertNumber, recipientEmail: studentEmail },
      holderId
    );

    const passphrase = "correct_horse_battery_staple_2026";
    const { encryptedBackup, credentialCount } = WalletService.exportVaultBackup(holderId, passphrase);

    expect(credentialCount).toBe(1);
    expect(encryptedBackup).toBeDefined();

    const backupObj = JSON.parse(encryptedBackup);
    expect(backupObj.iv).toBeDefined();
    expect(backupObj.tag).toBeDefined();
    expect(backupObj.data).toBeDefined();

    // Restore into a fresh holder vault
    const newHolderId = "holder_restored_02";
    const restoredCount = WalletService.importVaultBackup(encryptedBackup, newHolderId, passphrase);
    expect(restoredCount).toBe(1);

    const restoredCreds = WalletService.listCredentials(newHolderId);
    expect(restoredCreds.length).toBe(1);
    expect(restoredCreds[0].certificateNumber).toBe(testCertNumber);

    // Assert wrong passphrase fails decryption cleanly
    expect(() => {
      WalletService.importVaultBackup(encryptedBackup, "holder_fail", "wrong_passphrase");
    }).toThrow();
  });
});
