/**
 * CREDVAIL Phase 11 Verification Suite
 * 
 * Validates Holder Wallet and Selective Disclosure (ECDSA-SD-2023):
 * 1. Scaffolding & Architecture completeness
 * 2. Holder Cryptographic Identity & did:key Resolution
 * 3. Recipient Ownership Claiming & Email Verification
 * 4. ECDSA-SD-2023 Salting & SHA-256 Digest Commitments
 * 5. W3C Verifiable Presentation Construction with Attribute Blinding
 * 6. Verifier-Side Disclosure Evaluation & Privacy Preservation
 * 7. Replay-Resistant Nonce Challenge & Holder Proof Binding
 * 8. Disclosed Claim Tampering Detection (Adversarial Security M7)
 * 9. Empirical Thesis Metric M2 (>= 40% Wire Payload Reduction)
 * 10. Client-Side Encrypted Vault Backup & Restoration (AES-256-GCM)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

test("1. Phase 11 Scaffolding & Required Architecture Files Exist", () => {
  const requiredFiles = [
    "src/lib/crypto/selective-disclosure.ts",
    "src/lib/wallet/wallet-service.ts",
    "src/app/api/v1/wallet/claim/route.ts",
    "src/app/api/v1/wallet/credentials/route.ts",
    "src/app/api/v1/wallet/present/route.ts",
    "src/app/claim/page.tsx",
    "src/app/wallet/page.tsx",
    "test/unit/selective-disclosure.test.ts",
    "test/unit/wallet-vault.test.ts",
    "test/integration/wallet-selective-disclosure-flow.test.ts",
  ];

  for (const relPath of requiredFiles) {
    const fullPath = path.join(rootDir, relPath);
    assert.ok(fs.existsSync(fullPath), `Required Phase 11 file missing: ${relPath}`);
  }
});

test("2. Holder Cryptographic Identity & did:key Resolution", async () => {
  const { WalletService } = await import("../src/lib/wallet/wallet-service.ts");
  const { KeyService } = await import("../src/lib/crypto/key-service.ts");

  WalletService.resetInMemoryStore();
  const identity = WalletService.getOrCreateHolderIdentity("holder_diag_01");

  assert.ok(identity.did.startsWith("did:key:z"), `DID must start with did:key:z: ${identity.did}`);
  assert.ok(identity.keyPair.publicKeyPem.includes("BEGIN PUBLIC KEY"), "Public key PEM must be present");
  assert.ok(identity.keyPair.privateKeyPem.includes("BEGIN PRIVATE KEY"), "Private key PEM must be present");

  // Verify deterministic did:key recovery to public key PEM
  const recoveredPem = KeyService.didKeyToPublicKeyPem(identity.did);
  assert.equal(recoveredPem.trim(), identity.keyPair.publicKeyPem.trim(), "Recovered PEM must match original PEM");

  // Verify signing and verifying with holder key pair
  const sampleMessage = "Credential Holder Authentication Challenge 2026";
  const signature = KeyService.signData(identity.keyPair.privateKeyPem, sampleMessage);
  const isValid = KeyService.verifySignature(recoveredPem, sampleMessage, signature);
  assert.ok(isValid, "Holder signature verified with recovered public key");
});

test("3. Recipient Ownership Claiming & Email Verification", async () => {
  const { WalletService } = await import("../src/lib/wallet/wallet-service.ts");
  const { CredentialRepository } = await import("../src/lib/repositories/credential-repository.ts");
  const { TenantRepository, inMemoryTenantStore } = await import("../src/lib/repositories/tenant-repository.ts");
  const { KeyRepository } = await import("../src/lib/repositories/key-repository.ts");
  const { KeyService } = await import("../src/lib/crypto/key-service.ts");
  const { VcService } = await import("../src/lib/crypto/vc-service.ts");

  WalletService.resetInMemoryStore();
  CredentialRepository.resetInMemoryStore();
  inMemoryTenantStore.clear();
  KeyRepository.resetInMemoryStore();

  const tenantRepo = new TenantRepository();
  const tenant = await tenantRepo.createTenant({
    slug: "oxford-university",
    name: "University of Oxford",
    legalEntityName: "The Chancellor Masters and Scholars of Oxford",
    websiteUrl: "https://ox.ac.uk",
    didUri: "did:web:credvail.com:tenants:oxford-university",
    ownerUserId: "usr_oxford_reg",
  });

  const issuerKey = await KeyRepository.getOrCreateInitialKey(tenant.id, tenant.didUri);
  const issuerPrivatePem = KeyService.decryptPrivateKey(issuerKey.encryptedPrivateKey);

  const certNumber = "OX-2026-7777";
  const recipientEmail = "alan.turing@kings.ox.ac.uk";
  const recipientName = "Alan M. Turing";

  const fullClaims = {
    degree: "Doctor of Philosophy",
    field: "Mathematical Logic & Computation",
    honors: "First Class",
  };

  const unsigned = VcService.buildUnsignedCredential({
    credentialId: "urn:uuid:oxford-cred-777",
    certificateNumber: certNumber,
    tenantDidUri: tenant.didUri,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    recipientId: "rec_turing",
    recipientName,
    recipientEmail,
    claims: fullClaims,
    batchId: "batch_ox",
    merkleIndex: 0,
    bitstringIndex: 0,
  });

  const signedVc = VcService.signCredential(unsigned, issuerPrivatePem, `${tenant.didUri}#key-1`);

  await CredentialRepository.createCredential({
    credentialId: "urn:uuid:oxford-cred-777",
    certificateNumber: certNumber,
    tenantId: tenant.id,
    batchId: "batch_ox",
    recipientName,
    recipientEmail,
    leafHash: "0x1111222233334444555566667777888899990000111122223333444455556666",
    merkleIndex: 0,
    bitstringIndex: 0,
    claimsData: fullClaims,
    vcPayloadJson: signedVc,
  });

  // Legitimate claim succeeds
  const claimed = await WalletService.claimCredential(
    { certificateNumber: certNumber, recipientEmail },
    "holder_turing"
  );
  assert.equal(claimed.certificateNumber, certNumber);
  assert.equal(claimed.recipientEmail, recipientEmail);
  assert.ok(claimed.disclosures.degree, "Degree disclosure must be present");

  // Imposter claim fails
  await assert.rejects(
    async () => {
      await WalletService.claimCredential(
        { certificateNumber: certNumber, recipientEmail: "hacker@evil.org" },
        "holder_imposter"
      );
    },
    /Email verification failed/,
    "Imposter claim must be rejected"
  );
});

test("4. ECDSA-SD-2023 Salting & SHA-256 Digest Commitments", async () => {
  const { SelectiveDisclosureEngine } = await import("../src/lib/crypto/selective-disclosure.ts");

  const claims = {
    course: "Quantum Computing",
    grade: "A+",
    credits: "4.0",
    semester: "Fall 2026",
  };

  const pkg = SelectiveDisclosureEngine.createDisclosurePackage(claims);

  assert.equal(pkg.digests.length, 4, "Must generate 4 SHA-256 digests");
  for (const [key, val] of Object.entries(claims)) {
    const disc = pkg.credentialSubjectDisclosures[key];
    assert.ok(disc, `Disclosure for ${key} must exist`);
    assert.equal(disc.value, val);
    assert.match(disc.salt, /^[0-9a-f]{32}$/, "Salt must be 128-bit hex string");

    // Verify token can be decoded
    const decoded = JSON.parse(Buffer.from(disc.disclosureToken, "base64url").toString("utf8"));
    assert.equal(decoded.key, key);
    assert.equal(decoded.value, val);
    assert.equal(decoded.salt, disc.salt);
  }
});

test("5. W3C Verifiable Presentation Construction with Attribute Blinding", async () => {
  const { SelectiveDisclosureEngine } = await import("../src/lib/crypto/selective-disclosure.ts");
  const { KeyService } = await import("../src/lib/crypto/key-service.ts");
  const { VcService } = await import("../src/lib/crypto/vc-service.ts");

  const holderKeyPair = KeyService.generateEcdsaKeyPair();
  const holderDid = `did:key:${holderKeyPair.publicKeyMultibase}`;

  const claims = {
    first_name: "Grace",
    last_name: "Hopper",
    rank: "Rear Admiral",
    service_years: "42",
    clearance: "Top Secret",
  };

  const sdPkg = SelectiveDisclosureEngine.createDisclosurePackage(claims);
  const baseVc = VcService.buildUnsignedCredential({
    credentialId: "urn:uuid:naval-001",
    certificateNumber: "NAVY-1944",
    tenantDidUri: "did:web:navy.mil",
    tenantName: "United States Navy",
    tenantSlug: "navy",
    recipientId: "rec_hopper",
    recipientName: "Grace Hopper",
    recipientEmail: "ghopper@navy.mil",
    claims,
    batchId: "batch_navy",
    merkleIndex: 0,
    bitstringIndex: 0,
  });

  const { presentation, disclosedClaims, undisclosedCount } =
    SelectiveDisclosureEngine.createSelectivePresentation({
      baseCredential: baseVc,
      disclosures: sdPkg.credentialSubjectDisclosures,
      disclosedKeys: ["first_name", "last_name", "rank"], // blind service_years and clearance
      holderPrivateKeyPem: holderKeyPair.privateKeyPem,
      holderDid,
      challengeNonce: "cn_diag_test_nonce_555",
      verifierDomain: "dod.gov",
    });

  assert.equal(presentation.type[0], "VerifiablePresentation");
  assert.equal(presentation.holder, holderDid);
  assert.equal(undisclosedCount, 2, "2 attributes must be blinded");
  assert.deepEqual(disclosedClaims, {
    first_name: "Grace",
    last_name: "Hopper",
    rank: "Rear Admiral",
  });

  const innerSubject = presentation.verifiableCredential[0].credentialSubject;
  assert.equal(innerSubject.clearance, undefined, "Blinded attribute must not appear on wire");
  assert.equal(innerSubject.service_years, undefined, "Blinded attribute must not appear on wire");
});

test("6. Verifier-Side Disclosure Evaluation & Privacy Preservation", async () => {
  const { SelectiveDisclosureEngine } = await import("../src/lib/crypto/selective-disclosure.ts");
  const { KeyService } = await import("../src/lib/crypto/key-service.ts");
  const { VcService } = await import("../src/lib/crypto/vc-service.ts");

  const holderKeyPair = KeyService.generateEcdsaKeyPair();
  const holderDid = `did:key:${holderKeyPair.publicKeyMultibase}`;

  const claims = {
    institution: "MIT",
    degree: "B.S. Electrical Engineering",
    gpa: "4.00",
    disciplinary_records: "None",
  };

  const sdPkg = SelectiveDisclosureEngine.createDisclosurePackage(claims);
  const baseVc = VcService.buildUnsignedCredential({
    credentialId: "urn:uuid:mit-ee-001",
    certificateNumber: "MIT-EE-2026",
    tenantDidUri: "did:web:mit.edu",
    tenantName: "MIT",
    tenantSlug: "mit",
    recipientId: "rec_ee",
    recipientName: "Shannon",
    recipientEmail: "cshannon@mit.edu",
    claims,
    batchId: "batch_mit",
    merkleIndex: 0,
    bitstringIndex: 0,
  });

  const nonce = "cn_mit_eval_nonce_888";
  const { presentation } = SelectiveDisclosureEngine.createSelectivePresentation({
    baseCredential: baseVc,
    disclosures: sdPkg.credentialSubjectDisclosures,
    disclosedKeys: ["institution", "degree"], // blind gpa and disciplinary_records
    holderPrivateKeyPem: holderKeyPair.privateKeyPem,
    holderDid,
    challengeNonce: nonce,
    verifierDomain: "employer.com",
  });

  const evalResult = SelectiveDisclosureEngine.verifySelectivePresentation(
    presentation,
    holderKeyPair.publicKeyPem,
    nonce,
    "employer.com"
  );

  assert.ok(evalResult.isValid, "Presentation verification must pass");
  assert.ok(evalResult.holderProofValid, "Holder proof must be valid");
  assert.equal(evalResult.disclosedClaimCount, 2);
  assert.equal(evalResult.disclosedClaims.institution, "MIT");
  assert.equal(evalResult.disclosedClaims.degree, "B.S. Electrical Engineering");
  assert.equal(evalResult.disclosedClaims.gpa, undefined);
  assert.equal(evalResult.disclosedClaims.disciplinary_records, undefined);
});

test("7. Replay-Resistant Nonce Challenge & Holder Proof Binding", async () => {
  const { VerificationService } = await import("../src/lib/services/verification-service.ts");
  const { SelectiveDisclosureEngine } = await import("../src/lib/crypto/selective-disclosure.ts");
  const { KeyService } = await import("../src/lib/crypto/key-service.ts");
  const { VcService } = await import("../src/lib/crypto/vc-service.ts");

  const nonce = VerificationService.generateChallengeNonce(300);
  assert.ok(nonce.startsWith("cn_"), "Nonce must have cn_ prefix");

  const holderKeyPair = KeyService.generateEcdsaKeyPair();
  const holderDid = `did:key:${holderKeyPair.publicKeyMultibase}`;
  const claims = { cert: "Certified Ethical Hacker", score: "99" };
  const sdPkg = SelectiveDisclosureEngine.createDisclosurePackage(claims);

  const baseVc = VcService.buildUnsignedCredential({
    credentialId: "urn:uuid:ceh-001",
    certificateNumber: "CEH-2026-99",
    tenantDidUri: "did:web:eccouncil.org",
    tenantName: "EC-Council",
    tenantSlug: "eccouncil",
    recipientId: "rec_ceh",
    recipientName: "WhiteHat",
    recipientEmail: "whitehat@security.org",
    claims,
    batchId: "batch_ceh",
    merkleIndex: 0,
    bitstringIndex: 0,
  });

  const issuerKey = KeyService.generateEcdsaKeyPair();
  const signedVc = VcService.signCredential(
    baseVc,
    issuerKey.privateKeyPem,
    "did:web:eccouncil.org#key-1"
  );

  const { presentation } = SelectiveDisclosureEngine.createSelectivePresentation({
    baseCredential: signedVc,
    disclosures: sdPkg.credentialSubjectDisclosures,
    disclosedKeys: ["cert"],
    holderPrivateKeyPem: holderKeyPair.privateKeyPem,
    holderDid,
    challengeNonce: nonce,
  });

  // First verification consumes nonce -> passes
  const firstResult = await VerificationService.verifyPresentation(presentation, nonce);
  assert.ok(firstResult.isValid, "First presentation verification must pass");

  // Replay attempt with same nonce -> fails
  const replayResult = await VerificationService.verifyPresentation(presentation, nonce);
  assert.equal(replayResult.isValid, false, "Replayed nonce must be rejected");
  const nonceCheck = replayResult.checks.find((c) => c.code === "CHALLENGE_NONCE_VERIFICATION");
  assert.equal(nonceCheck?.passed, false);
});

test("8. Disclosed Claim Tampering Detection (Adversarial Security M7)", async () => {
  const { SelectiveDisclosureEngine } = await import("../src/lib/crypto/selective-disclosure.ts");
  const { KeyService } = await import("../src/lib/crypto/key-service.ts");
  const { VcService } = await import("../src/lib/crypto/vc-service.ts");

  const holderKeyPair = KeyService.generateEcdsaKeyPair();
  const holderDid = `did:key:${holderKeyPair.publicKeyMultibase}`;
  const claims = { role: "Junior Developer", clearance: "Level 1" };
  const sdPkg = SelectiveDisclosureEngine.createDisclosurePackage(claims);

  const baseVc = VcService.buildUnsignedCredential({
    credentialId: "urn:uuid:role-001",
    certificateNumber: "ROLE-101",
    tenantDidUri: "did:web:company.com",
    tenantName: "Company",
    tenantSlug: "company",
    recipientId: "rec_emp",
    recipientName: "Bob",
    recipientEmail: "bob@company.com",
    claims,
    batchId: "batch_role",
    merkleIndex: 0,
    bitstringIndex: 0,
  });

  const nonce = "cn_tamper_test_nonce";
  const { presentation } = SelectiveDisclosureEngine.createSelectivePresentation({
    baseCredential: baseVc,
    disclosures: sdPkg.credentialSubjectDisclosures,
    disclosedKeys: ["role"],
    holderPrivateKeyPem: holderKeyPair.privateKeyPem,
    holderDid,
    challengeNonce: nonce,
  });

  // Malicious tampering: alter the disclosed claim inside the token
  const vc = presentation.verifiableCredential[0];
  const originalToken = vc.credentialSubject._disclosures[0];
  const decoded = JSON.parse(Buffer.from(originalToken, "base64url").toString("utf8"));
  decoded.value = "Chief Technology Officer"; // elevation of privilege attack
  vc.credentialSubject._disclosures[0] = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");

  // Re-evaluating tampered presentation fails
  const verifyResult = SelectiveDisclosureEngine.verifySelectivePresentation(
    presentation,
    holderKeyPair.publicKeyPem,
    nonce
  );
  assert.equal(verifyResult.isValid, false, "Tampered presentation must be rejected");
});

test("9. Empirical Thesis Metric M2 (>= 40% Wire Payload Reduction)", async () => {
  const { SelectiveDisclosureEngine } = await import("../src/lib/crypto/selective-disclosure.ts");
  const { KeyService } = await import("../src/lib/crypto/key-service.ts");
  const { VcService } = await import("../src/lib/crypto/vc-service.ts");

  const holderKeyPair = KeyService.generateEcdsaKeyPair();
  const holderDid = `did:key:${holderKeyPair.publicKeyMultibase}`;

  const fullClaims = {
    full_legal_name: "Katherine Coleman Goble Johnson",
    student_id: "NASA-1958-MATH",
    degree_awarded: "Bachelor of Science in Mathematics and French",
    cumulative_gpa: "4.00 (Highest Honors)",
    faculty_advisor: "Prof. W.W. Schieffelin Claytor",
    honors_thesis_title: "Orbital Mechanics Calculations for Mercury Project Redstone Missions",
    conferral_date: "1937-05-18",
  };

  const sdPkg = SelectiveDisclosureEngine.createDisclosurePackage(fullClaims);
  const baseVc = VcService.buildUnsignedCredential({
    credentialId: "urn:uuid:nasa-kj-001",
    certificateNumber: "NASA-KJ-1958",
    tenantDidUri: "did:web:nasa.gov",
    tenantName: "NASA Langley",
    tenantSlug: "nasa",
    recipientId: "rec_johnson",
    recipientName: "Katherine Johnson",
    recipientEmail: "kjohnson@nasa.gov",
    claims: fullClaims,
    batchId: "batch_nasa",
    merkleIndex: 0,
    bitstringIndex: 0,
  });

  // Reveal only 2 of 7 attributes (5 blinded)
  const disclosedKeys = ["degree_awarded", "conferral_date"];
  const { wireSizeReductionPercent, undisclosedCount } =
    SelectiveDisclosureEngine.createSelectivePresentation({
      baseCredential: baseVc,
      disclosures: sdPkg.credentialSubjectDisclosures,
      disclosedKeys,
      holderPrivateKeyPem: holderKeyPair.privateKeyPem,
      holderDid,
      challengeNonce: "cn_m2_metric_bench",
    });

  assert.equal(undisclosedCount, 5, "5 attributes must remain blinded");
  assert.ok(
    wireSizeReductionPercent >= 40,
    `Empirical Metric M2 failure: Wire size reduction was ${wireSizeReductionPercent}%, expected >= 40%`
  );
  console.log(`\n  [Empirical Metric M2]: Wire payload reduction = ${wireSizeReductionPercent}% (Target: >= 40%)\n`);
});

test("10. Client-Side Encrypted Vault Backup & Restoration (AES-256-GCM)", async () => {
  const { WalletService } = await import("../src/lib/wallet/wallet-service.ts");

  const holderId = "holder_backup_test";
  const passphrase = "secure_vault_backup_passphrase_2026";

  const { encryptedBackup, credentialCount } = WalletService.exportVaultBackup(holderId, passphrase);
  assert.ok(encryptedBackup, "Backup string must be generated");

  const parsed = JSON.parse(encryptedBackup);
  assert.ok(parsed.iv, "AES-GCM IV must be present");
  assert.ok(parsed.tag, "AES-GCM Auth Tag must be present");
  assert.ok(parsed.data, "AES-GCM Ciphertext must be present");

  // Restore into a fresh holder vault
  const restoredHolderId = "holder_restored_target";
  const restoredCount = WalletService.importVaultBackup(encryptedBackup, restoredHolderId, passphrase);
  assert.equal(restoredCount, credentialCount);

  // Restore with incorrect passphrase must throw authentication error
  assert.throws(
    () => {
      WalletService.importVaultBackup(encryptedBackup, "holder_fail", "wrong_passphrase");
    },
    /Unsupported state or unable to authenticate data|bad decrypt/,
    "Decryption with incorrect passphrase must fail AES-GCM tag verification"
  );
});
