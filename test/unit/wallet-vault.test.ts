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
import { ClaimInvitationRepository } from "@/lib/repositories/claim-invitation-repository";
import { ClaimInvitationService } from "@/lib/services/claim-invitation-service";
import { BrowserWalletEngine } from "@/lib/wallet/browser-wallet";

describe("Phase 11: Holder Wallet & Client Vault Unit Tests", () => {
  let tenantId = "ten_wallet_test_001";
  const tenantSlug = "wallet-test-academy";
  const holderId = "holder_student_01";
  const testCertNumber = "WLT-2026-8888";
  const studentEmail = "student@wallet.test";
  let testClaimToken: string;

  beforeEach(async () => {
    WalletService.resetInMemoryStore();
    CredentialRepository.resetInMemoryStore();
    ClaimInvitationRepository.resetInMemoryStore();
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

    // Create single-use high-entropy claim invitation
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:cred-wallet-001",
      certificateNumber: testCertNumber,
      recipientEmail: studentEmail,
      tenantId,
    });
    testClaimToken = invite.rawToken;
  });

  it("1. generates deterministic independent holder identity with ECDSA P-256 key and did:key format in browser, rejecting server custody", async () => {
    // 1. Calling server-side holder identity creation must fail closed
    expect(() => WalletService.getOrCreateHolderIdentity("holder_alice")).toThrow(
      /deprecated and removed/i
    );

    // 2. Client-side BrowserWalletEngine generates valid non-extractable identity
    const id1 = await BrowserWalletEngine.generateHolderIdentity();
    expect(id1.did).toMatch(/^did:key:zDna[1-9A-HJ-NP-Za-km-z]+$/);
    expect(id1.publicKeyJwk.kty).toBe("EC");
    expect(id1.publicKeyJwk.crv).toBe("P-256");
    expect(id1.privateKey.extractable).toBe(false);

    // Two distinct holders must NEVER receive the same private key
    const id2 = await BrowserWalletEngine.generateHolderIdentity();
    expect(id2.did).not.toBe(id1.did);
    expect(id2.publicKeyJwk.x).not.toBe(id1.publicKeyJwk.x);
    expect(id2.privateKey).not.toBe(id1.privateKey);
  });

  it("2. claims issued credential using high-entropy claim token bound to recipient email", async () => {
    const claimed = await WalletService.claimCredential(
      {
        certificateNumber: testCertNumber,
        claimToken: testClaimToken,
        recipientEmail: studentEmail,
        userEmailVerified: true,
      },
      holderId
    );

    expect(claimed.certificateNumber).toBe(testCertNumber);
    expect(claimed.recipientEmail).toBe(studentEmail);
    expect(claimed.recipientName).toBe("Alice Student");
    expect(claimed.disclosures).toEqual({});

    // Check credential is in vault
    const inVault = WalletService.getCredential(testCertNumber, holderId);
    expect(inVault).not.toBeNull();
    expect(inVault?.credentialId).toBe(claimed.credentialId);
  });

  it("3. rejects claiming with non-existent certificate number", async () => {
    await expect(
      WalletService.claimCredential(
        {
          certificateNumber: "NON-EXISTENT-CERT",
          claimToken: testClaimToken,
          recipientEmail: studentEmail,
        },
        holderId
      )
    ).rejects.toThrow("not found");
  });

  it("4. rejects claiming when recipient email does not match credential subject (identity binding)", async () => {
    await expect(
      WalletService.claimCredential(
        {
          certificateNumber: testCertNumber,
          claimToken: testClaimToken,
          userEmail: "imposter@malicious.com",
        },
        holderId
      )
    ).rejects.toThrow(/Ownership verification failed/i);
  });

  it("5. rejects claiming by merely supplying recipient email without a claim token", async () => {
    await expect(
      WalletService.claimCredential(
        { certificateNumber: testCertNumber, recipientEmail: studentEmail },
        holderId
      )
    ).rejects.toThrow(/single-use claim invitation token is required/i);
  });

  it("6. rejects replaying an already consumed claim invitation token", async () => {
    // First claim succeeds
    await WalletService.claimCredential(
      {
        certificateNumber: testCertNumber,
        claimToken: testClaimToken,
        recipientEmail: studentEmail,
        userEmailVerified: true,
      },
      holderId
    );

    // Second claim with identical token fails (anti-replay)
    await expect(
      WalletService.claimCredential(
        {
          certificateNumber: testCertNumber,
          claimToken: testClaimToken,
          recipientEmail: studentEmail,
          userEmailVerified: true,
        },
        "attacker_holder"
      )
    ).rejects.toThrow(/already been consumed/i);
  });

  it("7. lists and retrieves credentials, and deletes credential on holder request", async () => {
    await WalletService.claimCredential(
      {
        certificateNumber: testCertNumber,
        claimToken: testClaimToken,
        recipientEmail: studentEmail,
        userEmailVerified: true,
      },
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

  it("8. refuses to create a presentation with the legacy custom disclosure format", async () => {
    await WalletService.claimCredential(
      {
        certificateNumber: testCertNumber,
        claimToken: testClaimToken,
        recipientEmail: studentEmail,
        userEmailVerified: true,
      },
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

  it("9. exports PBKDF2-HMAC-SHA256 encrypted vault backup and imports cleanly into new session", async () => {
    await WalletService.claimCredential(
      {
        certificateNumber: testCertNumber,
        claimToken: testClaimToken,
        recipientEmail: studentEmail,
        userEmailVerified: true,
      },
      holderId
    );

    const passphrase = "correct_horse_battery_staple_2026";
    const { encryptedBackup, credentialCount } = WalletService.exportVaultBackup(holderId, passphrase);

    expect(credentialCount).toBe(1);
    expect(encryptedBackup).toBeDefined();

    const backupObj = JSON.parse(encryptedBackup);
    expect(backupObj.version).toBe(1);
    expect(backupObj.kdf.algorithm).toBe("PBKDF2");
    expect(backupObj.kdf.iterations).toBe(600000);
    expect(backupObj.kdf.salt).toBeDefined();
    expect(backupObj.cipher.algorithm).toBe("AES-256-GCM");
    expect(backupObj.cipher.iv).toBeDefined();
    expect(backupObj.cipher.tag).toBeDefined();

    // Rejects empty passphrase
    expect(() => WalletService.exportVaultBackup(holderId, "")).toThrow(/non-empty passphrase/i);

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

    // Assert empty passphrase on import throws
    expect(() => {
      WalletService.importVaultBackup(encryptedBackup, "holder_fail", "");
    }).toThrow(/passphrase is required/i);
  });
});
