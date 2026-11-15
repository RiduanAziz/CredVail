/**
 * CREDVAIL Phase 12 Verification Suite
 * 
 * Validates Revocation and Freshness Architecture:
 * 1. Scaffolding & Architecture completeness
 * 2. W3C Bitstring Status List Bit Addressing & MSB-first bit order
 * 3. Bitstring GZIP Compression & Deterministic Digest Commitment
 * 4. Standards-Compliant StatusList2021 Verifiable Credential Builder
 * 5. Status Snapshot Dual-Mode Repository & Multi-Tenant Isolation
 * 6. Instant Revocation & Empirical Thesis Metric M6 (< 1.0s)
 * 7. Ethereum Sepolia On-Chain Status Digest Anchoring (O(1) scaling)
 * 8. Sibling Credential Isolation (Zero Collateral Damage)
 * 9. Graceful Key Epoch Rotation (AUTHENTICITY_ONLY Semantics)
 * 10. Emergency Key Compromise Revocation (INVALID Semantics / SEC-09)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

test("1. Phase 12 Scaffolding & Required Architecture Files Exist", () => {
  const requiredFiles = [
    "src/lib/services/status-list-service.ts",
    "src/lib/repositories/status-snapshot-repository.ts",
    "src/lib/services/revocation-freshness-service.ts",
    "src/app/api/v1/tenants/[slug]/status/[epoch]/route.ts",
    "src/app/api/v1/tenants/[slug]/status/snapshots/route.ts",
    "src/app/api/v1/tenants/[slug]/status/snapshots/anchor/route.ts",
    "src/app/api/v1/verify/freshness/[id]/route.ts",
    "test/unit/status-list.test.ts",
    "test/unit/status-snapshot.test.ts",
    "test/unit/freshness-evaluation.test.ts",
    "test/integration/revocation-freshness-flow.test.ts",
  ];

  for (const relPath of requiredFiles) {
    const fullPath = path.join(rootDir, relPath);
    assert.ok(fs.existsSync(fullPath), `Required Phase 12 file missing: ${relPath}`);
  }
});

test("2. W3C Bitstring Status List Bit Addressing & MSB-first bit order", async () => {
  const { StatusListService } = await import("../src/lib/services/status-list-service.ts");

  StatusListService.resetInMemoryStore();
  const bitstring = StatusListService.createBitstring(512);

  assert.equal(bitstring.length, 64, "512 bits must occupy 64 bytes");
  assert.equal(StatusListService.getBit(bitstring, 0), 0);
  assert.equal(StatusListService.getBit(bitstring, 42), 0);

  // Set bit 0, 7, 42
  StatusListService.setBit(bitstring, 0, 1);
  StatusListService.setBit(bitstring, 7, 1);
  StatusListService.setBit(bitstring, 42, 1);

  assert.equal(StatusListService.getBit(bitstring, 0), 1);
  assert.equal(StatusListService.getBit(bitstring, 1), 0);
  assert.equal(StatusListService.getBit(bitstring, 7), 1);
  assert.equal(StatusListService.getBit(bitstring, 8), 0);
  assert.equal(StatusListService.getBit(bitstring, 42), 1);
  assert.equal(StatusListService.getBit(bitstring, 43), 0);

  // Reset bit 7
  StatusListService.setBit(bitstring, 7, 0);
  assert.equal(StatusListService.getBit(bitstring, 7), 0);
});

test("3. Bitstring GZIP Compression & Deterministic Digest Commitment", async () => {
  const { StatusListService } = await import("../src/lib/services/status-list-service.ts");

  const bitstring = StatusListService.createBitstring(1024);
  StatusListService.setBit(bitstring, 10, 1);
  StatusListService.setBit(bitstring, 100, 1);

  const gzip = StatusListService.compressBitstring(bitstring);
  assert.ok(typeof gzip === "string" && gzip.length > 0, "GZIP Base64 must be non-empty");

  const decompressed = StatusListService.decompressBitstring(gzip);
  assert.equal(StatusListService.getBit(decompressed, 10), 1);
  assert.equal(StatusListService.getBit(decompressed, 100), 1);
  assert.equal(StatusListService.getBit(decompressed, 11), 0);

  const digest1 = StatusListService.computeStatusDigest(gzip);
  const digest2 = StatusListService.computeStatusDigest(gzip);
  assert.match(digest1, /^0x[0-9a-f]{64}$/, "Digest must be 32-byte hex");
  assert.equal(digest1, digest2, "Digest must be deterministic");
});

test("4. Standards-Compliant StatusList2021 Verifiable Credential Builder", async () => {
  const { StatusListService } = await import("../src/lib/services/status-list-service.ts");

  const bitstring = StatusListService.createBitstring(256);
  const gzip = StatusListService.compressBitstring(bitstring);

  const vc = StatusListService.buildStatusListCredential({
    tenantSlug: "stanford",
    tenantName: "Stanford University",
    statusEpoch: 1,
    bitstringGzipBase64: gzip,
    issuerDid: "did:web:credvail.com:tenants:stanford",
  });

  assert.ok(vc["@context"].includes("https://w3id.org/vc/status-list/2021/v1"));
  assert.ok(vc.type.includes("StatusList2021Credential"));
  assert.equal(vc.credentialSubject.type, "StatusList2021");
  assert.equal(vc.credentialSubject.statusPurpose, "revocation");
  assert.equal(vc.credentialSubject.encodedList, gzip);
});

test("5. Status Snapshot Dual-Mode Repository & Multi-Tenant Isolation", async () => {
  const { StatusSnapshotRepository } = await import("../src/lib/repositories/status-snapshot-repository.ts");

  StatusSnapshotRepository.resetInMemoryStore();
  const tntA = "tnt_diag_a";
  const tntB = "tnt_diag_b";

  await StatusSnapshotRepository.createSnapshot({
    tenantId: tntA,
    epoch: 1,
    bitstringGzipBase64: "snap_a_1",
    digestSha256: "0x1111",
  });

  await StatusSnapshotRepository.createSnapshot({
    tenantId: tntA,
    epoch: 2,
    bitstringGzipBase64: "snap_a_2",
    digestSha256: "0x2222",
  });

  await StatusSnapshotRepository.createSnapshot({
    tenantId: tntB,
    epoch: 1,
    bitstringGzipBase64: "snap_b_1",
    digestSha256: "0xbbbb",
  });

  const latestA = await StatusSnapshotRepository.getLatestSnapshot(tntA);
  assert.equal(latestA?.epoch, 2);
  assert.equal(latestA?.bitstringGzipBase64, "snap_a_2");

  const listA = await StatusSnapshotRepository.listSnapshots(tntA);
  assert.equal(listA.length, 2);

  const listB = await StatusSnapshotRepository.listSnapshots(tntB);
  assert.equal(listB.length, 1);
});

test("6. Instant Revocation & Empirical Thesis Metric M6 (< 1.0s)", async () => {
  const { RevocationFreshnessService } = await import("../src/lib/services/revocation-freshness-service.ts");
  const { CredentialRepository } = await import("../src/lib/repositories/credential-repository.ts");
  const { TenantRepository, inMemoryTenantStore } = await import("../src/lib/repositories/tenant-repository.ts");
  const { KeyRepository } = await import("../src/lib/repositories/key-repository.ts");
  const { StatusSnapshotRepository } = await import("../src/lib/repositories/status-snapshot-repository.ts");
  const { StatusListService } = await import("../src/lib/services/status-list-service.ts");

  StatusSnapshotRepository.resetInMemoryStore();
  StatusListService.resetInMemoryStore();
  CredentialRepository.resetInMemoryStore();
  inMemoryTenantStore.clear();
  KeyRepository.resetInMemoryStore();

  const tenantRepo = new TenantRepository();
  const tenant = await tenantRepo.createTenant({
    slug: "columbia-diag",
    name: "Columbia University",
    legalEntityName: "Trustees of Columbia University",
    websiteUrl: "https://columbia.edu",
    didUri: "did:web:credvail.com:tenants:columbia-diag",
    ownerUserId: "usr_columbia_dean",
  });

  await KeyRepository.getOrCreateInitialKey(tenant.id, tenant.didUri);

  const certNum = "COL-2026-DIAG-01";
  await CredentialRepository.createCredential({
    credentialId: "urn:uuid:col-diag-001",
    certificateNumber: certNum,
    tenantId: tenant.id,
    batchId: "batch_col",
    recipientName: "Test Student",
    recipientEmail: "student@columbia.edu",
    leafHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
    merkleIndex: 0,
    bitstringIndex: 12,
  });

  const t0 = performance.now();
  const outcome = await RevocationFreshnessService.revokeCredential({
    tenantId: tenant.id,
    credentialIdOrCertNumber: certNum,
    reason: "Administrative revocation",
    anchorOnChain: true,
  });
  const latencyMs = Math.round(performance.now() - t0);

  assert.equal(outcome.freshnessOutcome, "REVOKED");
  assert.ok(outcome.snapshot.digestSha256.startsWith("0x"), "Digest must be formatted hex");
  assert.ok(
    latencyMs < 1000,
    `Empirical Metric M6 failure: Revocation latency was ${latencyMs}ms, expected < 1000ms`
  );
  console.log(`\n  [Empirical Metric M6]: Revocation detection latency = ${latencyMs}ms (Target: < 1.0s)\n`);
});

test("7. Ethereum Sepolia On-Chain Status Digest Anchoring (O(1) scaling)", async () => {
  const { BlockchainService } = await import("../src/lib/blockchain/blockchain-service.ts");

  BlockchainService.resetSimulatedState();
  const tenantSlug = "princeton-math";
  const digest = "0x4444444444444444444444444444444444444444444444444444444444444444";

  const res = await BlockchainService.anchorStatusDigest(tenantSlug, 1, digest);
  assert.ok(res.txHash.startsWith("0x"), "Anchor txHash must be hex");
  assert.ok(res.blockNumber > 0, "Block number must be positive integer");

  const onChainRecord = await BlockchainService.getStatusDigest(tenantSlug, 1);
  assert.ok(onChainRecord?.exists, "On-chain record must exist");
  assert.equal(onChainRecord.digestSha256, digest);
});

test("8. Sibling Credential Isolation (Zero Collateral Damage)", async () => {
  const { RevocationFreshnessService } = await import("../src/lib/services/revocation-freshness-service.ts");
  const { CredentialRepository } = await import("../src/lib/repositories/credential-repository.ts");
  const { TenantRepository, inMemoryTenantStore } = await import("../src/lib/repositories/tenant-repository.ts");
  const { KeyRepository } = await import("../src/lib/repositories/key-repository.ts");
  const { StatusSnapshotRepository } = await import("../src/lib/repositories/status-snapshot-repository.ts");
  const { StatusListService } = await import("../src/lib/services/status-list-service.ts");

  StatusSnapshotRepository.resetInMemoryStore();
  StatusListService.resetInMemoryStore();
  CredentialRepository.resetInMemoryStore();
  inMemoryTenantStore.clear();
  KeyRepository.resetInMemoryStore();

  const tenantRepo = new TenantRepository();
  const tenant = await tenantRepo.createTenant({
    slug: "caltech-phys",
    name: "Caltech Physics",
    legalEntityName: "California Institute of Technology",
    websiteUrl: "https://pma.caltech.edu",
    didUri: "did:web:credvail.com:tenants:caltech-phys",
    ownerUserId: "usr_feynman",
  });

  await KeyRepository.getOrCreateInitialKey(tenant.id, tenant.didUri);

  const certA = "CALTECH-2026-A";
  const certB = "CALTECH-2026-B";

  await CredentialRepository.createCredential({
    credentialId: "urn:uuid:cal-001",
    certificateNumber: certA,
    tenantId: tenant.id,
    batchId: "batch_cal",
    recipientName: "Alice",
    recipientEmail: "alice@caltech.edu",
    leafHash: "0xaaaa",
    merkleIndex: 0,
    bitstringIndex: 20,
  });

  await CredentialRepository.createCredential({
    credentialId: "urn:uuid:cal-002",
    certificateNumber: certB,
    tenantId: tenant.id,
    batchId: "batch_cal",
    recipientName: "Bob",
    recipientEmail: "bob@caltech.edu",
    leafHash: "0xbbbb",
    merkleIndex: 1,
    bitstringIndex: 21,
  });

  // Revoke only certA
  await RevocationFreshnessService.revokeCredential({
    tenantId: tenant.id,
    credentialIdOrCertNumber: certA,
    reason: "Revoked A only",
  });

  const resA = await RevocationFreshnessService.evaluateFreshness(certA);
  const resB = await RevocationFreshnessService.evaluateFreshness(certB);

  assert.equal(resA.outcome, "REVOKED", "Credential A must be REVOKED");
  assert.equal(resB.outcome, "VALID_CURRENT", "Sibling Credential B must remain VALID_CURRENT");
  assert.equal(resB.isValid, true);
});

test("9. Graceful Key Epoch Rotation (AUTHENTICITY_ONLY Semantics)", async () => {
  const { RevocationFreshnessService } = await import("../src/lib/services/revocation-freshness-service.ts");
  const { CredentialRepository } = await import("../src/lib/repositories/credential-repository.ts");
  const { TenantRepository, inMemoryTenantStore } = await import("../src/lib/repositories/tenant-repository.ts");
  const { KeyRepository } = await import("../src/lib/repositories/key-repository.ts");
  const { StatusSnapshotRepository } = await import("../src/lib/repositories/status-snapshot-repository.ts");
  const { StatusListService } = await import("../src/lib/services/status-list-service.ts");

  StatusSnapshotRepository.resetInMemoryStore();
  StatusListService.resetInMemoryStore();
  CredentialRepository.resetInMemoryStore();
  inMemoryTenantStore.clear();
  KeyRepository.resetInMemoryStore();

  const tenantRepo = new TenantRepository();
  const tenant = await tenantRepo.createTenant({
    slug: "yale-law",
    name: "Yale Law School",
    legalEntityName: "Yale University",
    websiteUrl: "https://law.yale.edu",
    didUri: "did:web:credvail.com:tenants:yale-law",
    ownerUserId: "usr_yale_dean",
  });

  await KeyRepository.getOrCreateInitialKey(tenant.id, tenant.didUri);

  const certNum = "YALE-LAW-2026";
  await CredentialRepository.createCredential({
    credentialId: "urn:uuid:yale-001",
    certificateNumber: certNum,
    tenantId: tenant.id,
    batchId: "batch_yale",
    recipientName: "Legal Scholar",
    recipientEmail: "scholar@yale.edu",
    leafHash: "0xyale",
    merkleIndex: 0,
    bitstringIndex: 5,
  });

  // Create initial snapshot
  const bits = StatusListService.createBitstring();
  const gzip = StatusListService.compressBitstring(bits);
  await StatusSnapshotRepository.createSnapshot({
    tenantId: tenant.id,
    epoch: 1,
    bitstringGzipBase64: gzip,
    digestSha256: StatusListService.computeStatusDigest(gzip),
  });

  // Rotate key to Epoch 2
  await KeyRepository.rotateKey(tenant.id, tenant.didUri);

  const evalResult = await RevocationFreshnessService.evaluateFreshness(certNum);
  assert.equal(evalResult.outcome, "AUTHENTICITY_ONLY", "Historical key rotation must yield AUTHENTICITY_ONLY");
  assert.equal(evalResult.isValid, true);
  assert.equal(evalResult.keyGovernance.keyStatus, "ROTATED");
});

test("10. Emergency Key Compromise Revocation (INVALID Semantics / SEC-09)", async () => {
  const { RevocationFreshnessService } = await import("../src/lib/services/revocation-freshness-service.ts");
  const { CredentialRepository } = await import("../src/lib/repositories/credential-repository.ts");
  const { TenantRepository, inMemoryTenantStore } = await import("../src/lib/repositories/tenant-repository.ts");
  const { KeyRepository } = await import("../src/lib/repositories/key-repository.ts");

  CredentialRepository.resetInMemoryStore();
  inMemoryTenantStore.clear();
  KeyRepository.resetInMemoryStore();

  const tenantRepo = new TenantRepository();
  const tenant = await tenantRepo.createTenant({
    slug: "security-breach-lab",
    name: "Breached Lab",
    legalEntityName: "Breached Lab Inc",
    websiteUrl: "https://breached.edu",
    didUri: "did:web:credvail.com:tenants:security-breach-lab",
    ownerUserId: "usr_compromised",
  });

  await KeyRepository.getOrCreateInitialKey(tenant.id, tenant.didUri);

  const certNum = "BREACH-001";
  await CredentialRepository.createCredential({
    credentialId: "urn:uuid:breach-001",
    certificateNumber: certNum,
    tenantId: tenant.id,
    batchId: "batch_breach",
    recipientName: "Victim",
    recipientEmail: "victim@breached.edu",
    leafHash: "0xdeadbeef",
    merkleIndex: 0,
    bitstringIndex: 1,
  });

  // Flag Key Epoch 1 as COMPROMISED
  await KeyRepository.flagKeyCompromised(tenant.id, 1);

  const evalResult = await RevocationFreshnessService.evaluateFreshness(certNum);
  assert.equal(evalResult.outcome, "INVALID", "Compromised key epoch must yield INVALID (SEC-09)");
  assert.equal(evalResult.isValid, false);
  assert.equal(evalResult.keyGovernance.isCompromised, true);
});
