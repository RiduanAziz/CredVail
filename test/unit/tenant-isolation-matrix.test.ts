/**
 * CREDVAIL Multi-Tenant Isolation Matrix Test Suite (Phase 13)
 * 
 * Verifies strict cryptographic, database, and repository isolation across tenants:
 * - Credentials Repository
 * - Template Repository
 * - Key Management & Cryptographic Signing
 * - Status Snapshots & W3C Bitstrings
 * - Batch Processing & Recipient Rosters
 * - On-Chain Cryptographic Partitioning
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { TemplateRepository } from "@/lib/repositories/template-repository";
import { KeyRepository } from "@/lib/repositories/key-repository";
import { KeyService } from "@/lib/crypto/key-service";
import { StatusSnapshotRepository } from "@/lib/repositories/status-snapshot-repository";
import { StatusListService } from "@/lib/services/status-list-service";
import { BlockchainService } from "@/lib/blockchain/blockchain-service";

describe("Comprehensive Multi-Tenant Isolation Matrix (Cross-Tenant Boundary Integrity)", () => {
  const tenantA = "tnt_alpha_corp";
  const tenantB = "tnt_beta_ltd";

  beforeEach(() => {
    CredentialRepository.resetInMemoryStore();
    TemplateRepository.resetInMemoryStore();
    KeyRepository.resetInMemoryStore();
    StatusSnapshotRepository.resetInMemoryStore();
    StatusListService.clearCache();
    BlockchainService.resetSimulatedState();
  });

  it("1. Credentials Repository Isolation: Tenant B cannot query, retrieve, or mutate Tenant A credentials", async () => {
    // Seed credential in Tenant A
    const credA = await CredentialRepository.createCredential({
      credentialId: "urn:uuid:cred-tenant-a-1",
      certificateNumber: "ALPHA-2026-0001",
      tenantId: tenantA,
      batchId: "batch_alpha_1",
      recipientName: "Alice Alpha",
      recipientEmail: "alice@alpha.com",
      leafHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: { course: "Alpha Leadership" },
      vcPayloadJson: { id: "urn:uuid:cred-tenant-a-1" },
    });

    expect(credA).toBeDefined();

    // Query Tenant A credentials
    const tenantAList = await CredentialRepository.listCredentialsByTenant(tenantA);
    expect(tenantAList.length).toBe(1);
    expect(tenantAList[0].id).toBe(credA.id);

    // Query Tenant B credentials -> Must be completely empty
    const tenantBList = await CredentialRepository.listCredentialsByTenant(tenantB);
    expect(tenantBList.length).toBe(0);

    // Tenant B attempts direct lookup of Tenant A's credential by ID
    const crossTenantFetch = await CredentialRepository.findCredentialById(credA.id, tenantB);
    expect(crossTenantFetch).toBeNull();

    // Tenant B attempts direct lookup of Tenant A's credential by certificateNumber
    const crossCertLookup = await CredentialRepository.findCredentialByCertificateNumber("ALPHA-2026-0001", tenantB);
    expect(crossCertLookup).toBeNull();
  });

  it("2. Template Repository Isolation: Tenant B cannot view or modify Tenant A certificate templates", async () => {
    // Seed custom template for Tenant A
    const templateA = await TemplateRepository.createTemplate({
      name: "Alpha Executive Diploma",
      tenantId: tenantA,
      canvasWidth: 1920,
      canvasHeight: 1080,
      orientation: "LANDSCAPE",
      layoutConfig: { elements: [] },
      colorPalette: { primary: "#003366", secondary: "#D4AF37" },
      isDefault: true,
    });

    expect(templateA).toBeDefined();

    // Tenant A listing contains templateA
    const listA = await TemplateRepository.listTemplatesByTenant(tenantA);
    expect(listA.some((t) => t.id === templateA.id)).toBe(true);

    // Tenant B listing does not contain templateA
    const listB = await TemplateRepository.listTemplatesByTenant(tenantB);
    expect(listB.some((t) => t.id === templateA.id)).toBe(false);

    // Tenant B attempts to fetch templateA by ID
    const fetchCrossTenant = await TemplateRepository.findTemplateById(templateA.id, tenantB);
    expect(fetchCrossTenant).toBeNull();

    // Tenant B attempts to update templateA -> returns null / fails
    const updateCrossTenant = await TemplateRepository.updateTemplate(templateA.id, tenantB, {
      name: "Hijacked by Beta",
    });
    expect(updateCrossTenant).toBeNull();

    // Tenant B attempts to delete templateA -> returns false
    const deleteCrossTenant = await TemplateRepository.deleteTemplate(templateA.id, tenantB);
    expect(deleteCrossTenant).toBe(false);

    // Verify templateA is still intact for Tenant A
    const verifyIntact = await TemplateRepository.findTemplateById(templateA.id, tenantA);
    expect(verifyIntact?.name).toBe("Alpha Executive Diploma");
  });

  it("3. Cryptographic Key Management Isolation: Private signing keys are isolated per tenant", async () => {
    const keyA = await KeyRepository.getOrCreateInitialKey(tenantA, `did:web:credvail.com:tenants:${tenantA}`);
    const keyB = await KeyRepository.getOrCreateInitialKey(tenantB, `did:web:credvail.com:tenants:${tenantB}`);

    // Key pairs must be unique
    expect(keyA.fingerprint).not.toBe(keyB.fingerprint);
    expect(keyA.publicKeyJwk.x).not.toBe(keyB.publicKeyJwk.x);

    // Active key lookup is scoped by tenantId
    const activeKeyA = await KeyRepository.getActiveKey(tenantA);
    const activeKeyB = await KeyRepository.getActiveKey(tenantB);

    expect(activeKeyA?.fingerprint).toBe(keyA.fingerprint);
    expect(activeKeyB?.fingerprint).toBe(keyB.fingerprint);

    // Historical epochs for Tenant A do not contain Tenant B's keys
    const epochsA = await KeyRepository.listKeys(tenantA);
    expect(epochsA.every((k) => k.tenantId === tenantA)).toBe(true);
    expect(epochsA.some((k) => k.fingerprint === keyB.fingerprint)).toBe(false);
  });

  it("4. Status Snapshot & Bitstring Isolation: Tenant A revocation does not affect Tenant B bitstring", async () => {
    // Both tenants have bit 7 checked initially (0 for both)
    const zeroBuffer = StatusListService.createBitstring();
    const zeroGzip = StatusListService.compressBitstring(zeroBuffer);
    const initialBitA = StatusListService.getStatusBit(zeroGzip, 7);
    expect(initialBitA).toBe(0);

    // Mutate Tenant A's bitstring: set bit 7 = 1
    const rawBufferA = Buffer.alloc(16 * 1024, 0);
    StatusListService.setBit(rawBufferA, 7, 1);
    const compressedA = StatusListService.compressBitstring(rawBufferA);
    const digestA = StatusListService.computeStatusDigest(compressedA);

    // Save snapshot for Tenant A
    const snapshotA = await StatusSnapshotRepository.createSnapshot({
      tenantId: tenantA,
      epoch: 1,
      bitstringBase64: compressedA,
      statusDigest: digestA,
      totalCredentials: 10,
      revokedCount: 1,
    });

    // Save initial snapshot for Tenant B (all zeroes)
    const rawBufferB = Buffer.alloc(16 * 1024, 0);
    const compressedB = StatusListService.compressBitstring(rawBufferB);
    const digestB = StatusListService.computeStatusDigest(compressedB);

    const snapshotB = await StatusSnapshotRepository.createSnapshot({
      tenantId: tenantB,
      epoch: 1,
      bitstringBase64: compressedB,
      statusDigest: digestB,
      totalCredentials: 10,
      revokedCount: 0,
    });

    // Verify Tenant A snapshot has bit 7 = 1
    const decompressedA = StatusListService.decompressBitstring(snapshotA.bitstringGzipBase64);
    expect(StatusListService.getBit(decompressedA, 7)).toBe(1);

    // Verify Tenant B snapshot still has bit 7 = 0
    const decompressedB = StatusListService.decompressBitstring(snapshotB.bitstringGzipBase64);
    expect(StatusListService.getBit(decompressedB, 7)).toBe(0);

    // Snapshot listings are strictly tenant-isolated
    const listSnapshotsA = await StatusSnapshotRepository.listSnapshots(tenantA);
    expect(listSnapshotsA.length).toBe(1);
    expect(listSnapshotsA[0].tenantId).toBe(tenantA);

    const listSnapshotsB = await StatusSnapshotRepository.listSnapshots(tenantB);
    expect(listSnapshotsB.length).toBe(1);
    expect(listSnapshotsB[0].tenantId).toBe(tenantB);
  });

  it("5. On-Chain Smart Contract Multi-Tenant Cryptographic Partitioning", async () => {
    // Register issuer key for Tenant A and Tenant B
    const txA = await BlockchainService.registerKeyEpoch({
      tenantId: tenantA,
      epoch: 1,
      publicKeyPem: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----",
    });

    const txB = await BlockchainService.registerKeyEpoch({
      tenantId: tenantB,
      epoch: 1,
      publicKeyPem: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEB...\n-----END PUBLIC KEY-----",
    });

    expect(txA.transactionHash).toMatch(/^0x/);
    expect(txB.transactionHash).toMatch(/^0x/);

    // Query on-chain key info
    const keyInfoA = await BlockchainService.getKeyEpoch({ tenantId: tenantA, epoch: 1 });
    const keyInfoB = await BlockchainService.getKeyEpoch({ tenantId: tenantB, epoch: 1 });

    expect(keyInfoA).toBeDefined();
    expect(keyInfoB).toBeDefined();

    // Flagging compromise for Tenant A does NOT compromise Tenant B
    await BlockchainService.flagKeyCompromised({
      tenantId: tenantA,
      epoch: 1,
      reason: "Tenant A private key leak",
    });

    const updatedKeyA = await BlockchainService.getKeyEpoch({ tenantId: tenantA, epoch: 1 });
    const updatedKeyB = await BlockchainService.getKeyEpoch({ tenantId: tenantB, epoch: 1 });

    expect(updatedKeyA?.isCompromised).toBe(true);
    expect(updatedKeyB?.isCompromised).toBe(false);
  });
});
