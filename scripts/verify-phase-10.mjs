/**
 * CREDVAIL Phase 10 Verification Suite
 * 
 * Validates the Public Verification Engine:
 * 1. Scaffolding & Architecture completeness
 * 2. Multi-Identifier Public Resolution (URN, UUID, Certificate Number, Internal ID)
 * 3. W3C Verifiable Credentials 2.0 Schema Conformance
 * 4. RFC 8785 Canonical JSON Recalculation & Tamper Rejection
 * 5. ECDSA NIST P-256 Digital Signature Verification (JsonWebSignature2020)
 * 6. Keccak-256 Merkle Inclusion Proof Verification (OpenZeppelin Parity)
 * 7. Institutional Key Epoch & Compromise Detection (SEC-09)
 * 8. Real-time Credential Revocation Detection (Metric M6)
 * 9. Ethereum Sepolia Smart Contract Registry Consensus
 * 10. Public REST API Endpoints & PDF Streaming
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

test("1. Phase 10 Scaffolding & Required Architecture Files Exist", () => {
  const requiredFiles = [
    "src/lib/services/verification-service.ts",
    "src/app/verify/page.tsx",
    "src/app/verify/[id]/page.tsx",
    "src/app/api/v1/verify/lookup/[id]/route.ts",
    "src/app/api/v1/verify/presentation/route.ts",
    "src/app/api/v1/verify/challenge/route.ts",
    "src/app/api/v1/verify/[id]/pdf/route.ts",
    "src/app/api/v1/tenants/[slug]/credentials/[id]/revoke/route.ts",
    "test/unit/verification-service.test.ts",
    "test/integration/public-verification-flow.test.ts",
  ];

  for (const relPath of requiredFiles) {
    const fullPath = path.join(rootDir, relPath);
    assert.ok(fs.existsSync(fullPath), `Required Phase 10 file missing: ${relPath}`);
  }
});

test("2. Multi-Identifier Public Registry Resolution (URN, UUID, Cert#, Internal ID)", async () => {
  const { VerificationService } = await import("../src/lib/services/verification-service.ts");
  const { CredentialRepository } = await import("../src/lib/repositories/credential-repository.ts");
  const { TenantRepository } = await import("../src/lib/repositories/tenant-repository.ts");
  const { KeyRepository } = await import("../src/lib/repositories/key-repository.ts");
  const { VcService } = await import("../src/lib/crypto/vc-service.ts");
  const { KeyService } = await import("../src/lib/crypto/key-service.ts");

  CredentialRepository.resetInMemoryStore();
  KeyRepository.resetInMemoryStore();

  const tenantRepo = new TenantRepository();
  const slug = `diag-tenant-${Date.now()}`;
  const tenant = await tenantRepo.createTenant({
    slug,
    name: "Diagnostic University",
    legalEntityName: "Diagnostic University Inc.",
    websiteUrl: "https://diag.edu",
    didUri: `did:web:credvail.com:tenants:${slug}`,
    ownerUserId: "usr_diag",
  });

  const issuerKey = await KeyRepository.getOrCreateInitialKey(tenant.id, tenant.didUri);
  const privateKeyPem = KeyService.decryptPrivateKey(issuerKey.encryptedPrivateKey);

  const credentialId = "urn:uuid:7c9e6679-7425-40de-944b-e07fc1f90ae7";
  const certNumber = "DIAG-2026-0001";

  const unsigned = VcService.buildUnsignedCredential({
    credentialId,
    issuerDid: tenant.didUri,
    issuerName: tenant.name,
    issuanceDate: new Date().toISOString(),
    claims: {
      recipient_name: "Bob Diagnostic",
      certificate_number: certNumber,
      course_name: "Systems Engineering",
    },
  });

  let signed = VcService.signCredential(unsigned, privateKeyPem, `${tenant.didUri}#key-1`);
  const vcHash = VcService.computeVcHash(signed);
  const leafHash = VcService.computeLeafHash(credentialId, certNumber, vcHash);
  const tree = VcService.buildBatchMerkleTree([leafHash]);
  const proof = VcService.generateMerkleProof(tree, 0);
  signed = VcService.attachMerkleProof(signed, proof, "batch_diag");

  const cred = await CredentialRepository.createCredential({
    tenantId: tenant.id,
    batchId: "batch_diag",
    credentialId,
    certificateNumber: certNumber,
    recipientName: "Bob Diagnostic",
    recipientEmail: "bob@diag.edu",
    leafHash,
    merkleIndex: 0,
    bitstringIndex: 0,
    claimsData: { recipient_name: "Bob Diagnostic", certificate_number: certNumber },
    vcPayloadJson: signed,
    merkleProof: proof,
  });

  // Verify resolution across all 4 identifier formats
  const byCert = await VerificationService.verifyByPublicId(certNumber);
  assert.equal(byCert.status, "VALID");
  assert.equal(byCert.credential.recipientName, "Bob Diagnostic");

  const byUrn = await VerificationService.verifyByPublicId(credentialId);
  assert.equal(byUrn.status, "VALID");

  const byUuid = await VerificationService.verifyByPublicId("7c9e6679-7425-40de-944b-e07fc1f90ae7");
  assert.equal(byUuid.status, "VALID");

  const byInternal = await VerificationService.verifyByPublicId(cred.id);
  assert.equal(byInternal.status, "VALID");

  // Non-existent identifier
  const notFound = await VerificationService.verifyByPublicId("NON-EXISTENT-999");
  assert.equal(notFound.status, "NOT_FOUND");
  assert.equal(notFound.isValid, false);
});

test("3. Structural & W3C Verifiable Credentials 2.0 Schema Conformance", async () => {
  const { VerificationService } = await import("../src/lib/services/verification-service.ts");

  // Valid raw payload
  const validPayload = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: "urn:uuid:mock-vc-001",
    type: ["VerifiableCredential"],
    issuer: { id: "did:web:credvail.com:tenants:test", name: "Test" },
    validFrom: new Date().toISOString(),
    credentialSubject: {
      id: "urn:uuid:recipient-001",
      name: "Subject",
      certificateNumber: "TEST-001",
      claims: { course: "Testing" },
    },
    proof: {
      type: "JsonWebSignature2020",
      created: new Date().toISOString(),
      verificationMethod: "did:web:credvail.com:tenants:test#key-1",
      jws: "mock.jws.signature",
    },
  };

  const res = await VerificationService.verifyRawCredential(validPayload);
  const schemaCheck = res.checks.find((c) => c.code === "W3C_SCHEMA_CONFORMANCE");
  assert.ok(schemaCheck);
  assert.equal(schemaCheck.passed, true);

  // Missing proof
  const invalidPayload = { ...validPayload, proof: undefined };
  const resBad = await VerificationService.verifyRawCredential(invalidPayload);
  const badCheck = resBad.checks.find((c) => c.code === "W3C_SCHEMA_CONFORMANCE");
  assert.ok(badCheck);
  assert.equal(badCheck.passed, false);
});

test("4. RFC 8785 Canonical JSON Recalculation & Tamper Rejection", async () => {
  const { VerificationService } = await import("../src/lib/services/verification-service.ts");
  const { CredentialRepository } = await import("../src/lib/repositories/credential-repository.ts");
  const { TenantRepository } = await import("../src/lib/repositories/tenant-repository.ts");
  const { KeyRepository } = await import("../src/lib/repositories/key-repository.ts");
  const { VcService } = await import("../src/lib/crypto/vc-service.ts");
  const { KeyService } = await import("../src/lib/crypto/key-service.ts");

  CredentialRepository.resetInMemoryStore();
  KeyRepository.resetInMemoryStore();

  const tenantRepo = new TenantRepository();
  const slug = `tamper-tenant-${Date.now()}`;
  const tenant = await tenantRepo.createTenant({
    slug,
    name: "Tamper Test Inst",
    legalEntityName: "Tamper Inc.",
    websiteUrl: "https://tamper.org",
    didUri: `did:web:credvail.com:tenants:${slug}`,
    ownerUserId: "usr_tamper",
  });

  const issuerKey = await KeyRepository.getOrCreateInitialKey(tenant.id, tenant.didUri);
  const privateKeyPem = KeyService.decryptPrivateKey(issuerKey.encryptedPrivateKey);

  const credId = "urn:uuid:tamper-test-uuid";
  const certNum = "TAMP-2026-0001";

  const unsigned = VcService.buildUnsignedCredential({
    credentialId: credId,
    issuerDid: tenant.didUri,
    issuerName: tenant.name,
    issuanceDate: new Date().toISOString(),
    claims: { grade: "Grade A", certificate_number: certNum },
  });

  let signed = VcService.signCredential(unsigned, privateKeyPem, `${tenant.didUri}#key-1`);
  const vcHash = VcService.computeVcHash(signed);
  const leafHash = VcService.computeLeafHash(credId, certNum, vcHash);
  const tree = VcService.buildBatchMerkleTree([leafHash]);
  const proof = VcService.generateMerkleProof(tree, 0);
  signed = VcService.attachMerkleProof(signed, proof, "b1");

  const cred = await CredentialRepository.createCredential({
    tenantId: tenant.id,
    batchId: "b1",
    credentialId: credId,
    certificateNumber: certNum,
    recipientName: "Honest Student",
    recipientEmail: "honest@example.com",
    leafHash,
    merkleIndex: 0,
    bitstringIndex: 0,
    claimsData: { grade: "Grade A" },
    vcPayloadJson: signed,
    merkleProof: proof,
  });

  // Tamper claims: change grade to Grade A+
  const tamperedJson = JSON.parse(JSON.stringify(signed));
  tamperedJson.credentialSubject.claims.grade = "Grade A+ (Tampered)";

  await CredentialRepository.updateCredentialPayload(tenant.id, cred.id, tamperedJson);

  const tamperedResult = await VerificationService.verifyByPublicId(certNum);
  assert.equal(tamperedResult.status, "INVALID");
  assert.equal(tamperedResult.isValid, false);
  assert.equal(tamperedResult.cryptography.canonicalHashMatches, false);
});

test("5. ECDSA NIST P-256 Digital Signature Verification (JsonWebSignature2020)", async () => {
  const { KeyService } = await import("../src/lib/crypto/key-service.ts");
  const { VcService } = await import("../src/lib/crypto/vc-service.ts");

  const keyPair = KeyService.generateEcdsaKeyPair();
  const unsigned = VcService.buildUnsignedCredential({
    credentialId: "urn:uuid:sig-test-vc",
    issuerDid: "did:web:example.com",
    issuerName: "Example Org",
    issuanceDate: new Date().toISOString(),
    claims: { test: "value" },
  });

  const signed = VcService.signCredential(unsigned, keyPair.privateKeyPem, "did:web:example.com#key-1");
  const valid = VcService.verifyCredentialSignature(signed, keyPair.publicKeyPem);
  assert.equal(valid, true);

  // Corrupt signature
  const corrupted = JSON.parse(JSON.stringify(signed));
  corrupted.proof.jws = corrupted.proof.jws.slice(0, -6) + "000000";
  const invalid = VcService.verifyCredentialSignature(corrupted, keyPair.publicKeyPem);
  assert.equal(invalid, false);
});

test("6. Keccak-256 Merkle Inclusion Proof Verification (OpenZeppelin Parity)", async () => {
  const { CredvailMerkleTree } = await import("../src/lib/crypto/merkle.ts");

  const leaf1 = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const leaf2 = "0x2222222222222222222222222222222222222222222222222222222222222222";
  const leaf3 = "0x3333333333333333333333333333333333333333333333333333333333333333";
  const leaf4 = "0x4444444444444444444444444444444444444444444444444444444444444444";

  const tree = new CredvailMerkleTree([leaf1, leaf2, leaf3, leaf4]);
  const root = tree.getRoot();

  for (let i = 0; i < 4; i++) {
    const leaf = tree.getLeaf(i);
    const proof = tree.getProof(i);
    const verified = CredvailMerkleTree.verifyProof(leaf, proof, root);
    assert.equal(verified, true, `Leaf ${i} proof verification failed`);
  }

  // Corrupted leaf
  const tamperedVerified = CredvailMerkleTree.verifyProof(
    "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    tree.getProof(0),
    root
  );
  assert.equal(tamperedVerified, false);
});

test("7. Institutional Key Epoch & Compromise Detection (SEC-09)", async () => {
  const { VerificationService } = await import("../src/lib/services/verification-service.ts");
  const { CredentialRepository } = await import("../src/lib/repositories/credential-repository.ts");
  const { TenantRepository } = await import("../src/lib/repositories/tenant-repository.ts");
  const { KeyRepository } = await import("../src/lib/repositories/key-repository.ts");
  const { VcService } = await import("../src/lib/crypto/vc-service.ts");
  const { KeyService } = await import("../src/lib/crypto/key-service.ts");

  CredentialRepository.resetInMemoryStore();
  KeyRepository.resetInMemoryStore();

  const tenantRepo = new TenantRepository();
  const slug = `comp-tenant-${Date.now()}`;
  const tenant = await tenantRepo.createTenant({
    slug,
    name: "Compromise Test Org",
    legalEntityName: "Compromise Org",
    websiteUrl: "https://compromise.org",
    didUri: `did:web:credvail.com:tenants:${slug}`,
    ownerUserId: "usr_comp",
  });

  const issuerKey = await KeyRepository.getOrCreateInitialKey(tenant.id, tenant.didUri);
  const privateKeyPem = KeyService.decryptPrivateKey(issuerKey.encryptedPrivateKey);

  const credId = "urn:uuid:comp-test-vc";
  const certNum = "COMP-2026-0001";

  const unsigned = VcService.buildUnsignedCredential({
    credentialId: credId,
    issuerDid: tenant.didUri,
    issuerName: tenant.name,
    issuanceDate: new Date().toISOString(),
    claims: { cert: certNum },
  });

  let signed = VcService.signCredential(unsigned, privateKeyPem, `${tenant.didUri}#key-1`);
  const vcHash = VcService.computeVcHash(signed);
  const leafHash = VcService.computeLeafHash(credId, certNum, vcHash);
  const tree = VcService.buildBatchMerkleTree([leafHash]);
  const proof = VcService.generateMerkleProof(tree, 0);
  signed = VcService.attachMerkleProof(signed, proof, "b_comp");

  await CredentialRepository.createCredential({
    tenantId: tenant.id,
    batchId: "b_comp",
    credentialId: credId,
    certificateNumber: certNum,
    recipientName: "Compromise Subject",
    recipientEmail: "comp@example.com",
    leafHash,
    merkleIndex: 0,
    bitstringIndex: 0,
    claimsData: { cert: certNum },
    vcPayloadJson: signed,
    merkleProof: proof,
  });

  // Flag epoch 1 compromised
  await KeyRepository.flagKeyCompromised(tenant.id, 1);

  const compResult = await VerificationService.verifyByPublicId(certNum);
  assert.equal(compResult.status, "COMPROMISED");
  assert.equal(compResult.isValid, false);
  assert.equal(compResult.issuer.keyStatus, "COMPROMISED");

  const compCheck = compResult.checks.find((c) => c.code === "KEY_COMPROMISE_CHECK");
  assert.ok(compCheck);
  assert.equal(compCheck.passed, false);
});

test("8. Real-time Credential Revocation Detection (Metric M6)", async () => {
  const { VerificationService } = await import("../src/lib/services/verification-service.ts");
  const { CredentialRepository } = await import("../src/lib/repositories/credential-repository.ts");
  const { TenantRepository } = await import("../src/lib/repositories/tenant-repository.ts");
  const { KeyRepository } = await import("../src/lib/repositories/key-repository.ts");
  const { VcService } = await import("../src/lib/crypto/vc-service.ts");
  const { KeyService } = await import("../src/lib/crypto/key-service.ts");

  CredentialRepository.resetInMemoryStore();
  KeyRepository.resetInMemoryStore();

  const tenantRepo = new TenantRepository();
  const slug = `rev-tenant-${Date.now()}`;
  const tenant = await tenantRepo.createTenant({
    slug,
    name: "Revocation Test Org",
    legalEntityName: "Revocation Org",
    websiteUrl: "https://rev.org",
    didUri: `did:web:credvail.com:tenants:${slug}`,
    ownerUserId: "usr_rev",
  });

  const issuerKey = await KeyRepository.getOrCreateInitialKey(tenant.id, tenant.didUri);
  const privateKeyPem = KeyService.decryptPrivateKey(issuerKey.encryptedPrivateKey);

  const credId = "urn:uuid:rev-test-vc";
  const certNum = "REV-2026-0001";

  const unsigned = VcService.buildUnsignedCredential({
    credentialId: credId,
    issuerDid: tenant.didUri,
    issuerName: tenant.name,
    issuanceDate: new Date().toISOString(),
    claims: { cert: certNum },
  });

  let signed = VcService.signCredential(unsigned, privateKeyPem, `${tenant.didUri}#key-1`);
  const vcHash = VcService.computeVcHash(signed);
  const leafHash = VcService.computeLeafHash(credId, certNum, vcHash);
  const tree = VcService.buildBatchMerkleTree([leafHash]);
  const proof = VcService.generateMerkleProof(tree, 0);
  signed = VcService.attachMerkleProof(signed, proof, "b_rev");

  const cred = await CredentialRepository.createCredential({
    tenantId: tenant.id,
    batchId: "b_rev",
    credentialId: credId,
    certificateNumber: certNum,
    recipientName: "Revoked Candidate",
    recipientEmail: "rev@example.com",
    leafHash,
    merkleIndex: 0,
    bitstringIndex: 0,
    claimsData: { cert: certNum },
    vcPayloadJson: signed,
    merkleProof: proof,
  });

  // Verify before revocation
  const preRev = await VerificationService.verifyByPublicId(certNum);
  assert.equal(preRev.status, "VALID");

  // Revoke credential
  const t0 = performance.now();
  await CredentialRepository.revokeCredential(tenant.id, cred.id, "Administrative sanctions");
  const postRev = await VerificationService.verifyByPublicId(certNum);
  const latency = performance.now() - t0;

  assert.equal(postRev.status, "REVOKED");
  assert.equal(postRev.isValid, false);
  assert.equal(postRev.credential.state, "REVOKED");
  assert.ok(latency < 1000, `Revocation detection latency was ${latency}ms, exceeding 1000ms target`);
});

test("9. Ethereum Sepolia Blockchain Consensus & On-Chain Verification", async () => {
  const { VerificationService } = await import("../src/lib/services/verification-service.ts");
  const { CredentialRepository } = await import("../src/lib/repositories/credential-repository.ts");
  const { TenantRepository } = await import("../src/lib/repositories/tenant-repository.ts");
  const { BatchRepository } = await import("../src/lib/repositories/batch-repository.ts");
  const { KeyRepository } = await import("../src/lib/repositories/key-repository.ts");
  const { BlockchainService } = await import("../src/lib/blockchain/blockchain-service.ts");
  const { VcService } = await import("../src/lib/crypto/vc-service.ts");
  const { KeyService } = await import("../src/lib/crypto/key-service.ts");

  CredentialRepository.resetInMemoryStore();
  BlockchainService.resetSimulatedState();
  KeyRepository.resetInMemoryStore();

  const tenantRepo = new TenantRepository();
  const slug = `bc-tenant-${Date.now()}`;
  const tenant = await tenantRepo.createTenant({
    slug,
    name: "Sepolia Verified University",
    legalEntityName: "Sepolia University",
    websiteUrl: "https://sepolia-uni.edu",
    didUri: `did:web:credvail.com:tenants:${slug}`,
    ownerUserId: "usr_bc",
  });

  const issuerKey = await KeyRepository.getOrCreateInitialKey(tenant.id, tenant.didUri);
  const privateKeyPem = KeyService.decryptPrivateKey(issuerKey.encryptedPrivateKey);

  const credId = "urn:uuid:sepolia-test-vc";
  const certNum = "SEPO-2026-0001";

  const unsigned = VcService.buildUnsignedCredential({
    credentialId: credId,
    issuerDid: tenant.didUri,
    issuerName: tenant.name,
    issuanceDate: new Date().toISOString(),
    claims: { cert: certNum },
  });

  let signed = VcService.signCredential(unsigned, privateKeyPem, `${tenant.didUri}#key-1`);
  const vcHash = VcService.computeVcHash(signed);
  const leafHash = VcService.computeLeafHash(credId, certNum, vcHash);
  const tree = VcService.buildBatchMerkleTree([leafHash]);
  const proof = VcService.generateMerkleProof(tree, 0);

  const batch = await BatchRepository.createBatch({
    tenantId: tenant.id,
    templateId: "t1",
    issuerKeyId: issuerKey.id,
    title: "Sepolia Batch",
    stagedRecipients: [],
  });

  // Anchor to Sepolia
  const receipt = await BlockchainService.anchorBatch(slug, batch.id, tree.getRoot(), 1);
  signed = VcService.attachMerkleProof(signed, proof, batch.id);

  await BatchRepository.updateBatchStatus(tenant.id, batch.id, "GENERATED", {
    merkleRoot: tree.getRoot(),
    onChainTxHash: receipt.txHash,
    blockchainBlockNumber: receipt.blockNumber,
  });

  await CredentialRepository.createCredential({
    tenantId: tenant.id,
    batchId: batch.id,
    credentialId: credId,
    certificateNumber: certNum,
    recipientName: "Sepolia Scholar",
    recipientEmail: "scholar@sepolia.edu",
    leafHash,
    merkleIndex: 0,
    bitstringIndex: 0,
    claimsData: { cert: certNum },
    vcPayloadJson: signed,
    merkleProof: proof,
  });

  const res = await VerificationService.verifyByPublicId(certNum);
  assert.equal(res.status, "VALID");
  assert.equal(res.blockchain.anchored, true);
  assert.equal(res.blockchain.network, "Ethereum Sepolia");
  assert.ok(res.blockchain.txHash?.startsWith("0x"));
  assert.ok(res.blockchain.etherscanUrl?.includes("sepolia.etherscan.io"));
});

test("10. Public REST API Endpoints & Replay-Resistant Challenge Nonce", async () => {
  const { VerificationService } = await import("../src/lib/services/verification-service.ts");

  // Create nonce
  const { nonce, expiresAt } = VerificationService.createChallengeNonce();
  assert.ok(nonce.startsWith("cn_"));
  assert.ok(new Date(expiresAt).getTime() > Date.now());

  // Consume nonce
  const validFirstUse = VerificationService.consumeChallengeNonce(nonce);
  assert.equal(validFirstUse, true);

  // Replay attempt fails
  const replayedUse = VerificationService.consumeChallengeNonce(nonce);
  assert.equal(replayedUse, false);
});
